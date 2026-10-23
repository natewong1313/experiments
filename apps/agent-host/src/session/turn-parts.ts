import {
  ActionType as AHPActionType,
  ResponsePartKind as AHPResponsePartKind,
} from "@microsoft/agent-host-protocol";
import type {
  ChatAction as AHPChatAction,
  ResponsePart as AHPResponsePart,
} from "@microsoft/agent-host-protocol";
import type { TurnUpdate } from "./agent-connection";
import { advanceToolCall, mergeToolCall, progressOf } from "./tool-call-state";
import type { ToolCall, ToolProgress } from "./tool-call-state";

type TextKind = AHPResponsePartKind.Markdown | AHPResponsePartKind.Reasoning;

/** A text or thinking update of a prompt. */
type TextUpdate = Extract<
  TurnUpdate,
  { sessionUpdate: "agent_message_chunk" | "agent_thought_chunk" }
>;

/** A markdown or reasoning part of the turn, and all its text. */
type TextPart = { kind: TextKind; id: string; content: string };

/** A tool call part of the turn, and how far it has advanced. */
type ToolPart = { kind: AHPResponsePartKind.ToolCall; toolCallId: string; progress: ToolProgress };

/** A part of the turn that the output writes. The output leaves parts of other kinds alone. */
type OutputPart = TextPart | ToolPart;

/** A part of a replay: a run of text of one kind, or a tool call as its updates leave it. */
type ReplayedPart =
  | { kind: TextKind; content: string }
  | { kind: AHPResponsePartKind.ToolCall; call: ToolCall };

const LAST = -1;

/**
 * The response parts of a turn that a prompt writes, and the actions that change them. Text
 * continues the last part if it has the same kind, and starts a new part otherwise. Each tool
 * call has one part, which advances with its updates.
 */
export class TurnParts {
  private turnId: string;
  private parts: OutputPart[];
  private calls: Map<string, ToolCall> = new Map();

  /** `stored` holds the response parts of the turn so far, with their streamed text. */
  constructor(turnId: string, stored: readonly AHPResponsePart[]) {
    this.turnId = turnId;
    this.parts = stored.flatMap((part) => outputPartsOf(part));
  }

  /** Applies one live update, and returns the actions that make the change. */
  apply(update: TurnUpdate): AHPChatAction[] {
    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      const call = mergeToolCall(this.calls.get(update.toolCallId), update);

      return call ? this.advanceTool(call) : [];
    }

    const text = update.content.type === "text" ? update.content.text : "";
    const last = this.parts.at(LAST);
    const kind = textKindOf(update);

    if (text === "") {
      return [];
    }

    return last?.kind === kind ? this.extendText(last, text) : [this.addText(kind, text)];
  }

  /**
   * Brings the parts to the output that a replay holds, and returns the actions that make the
   * change. The longest start of the replay that matches the parts in order keeps its parts.
   * Stored parts that the agent no longer has do not break the match. Text extends a kept part,
   * and a kept tool call advances. The rest of the replay becomes new parts. When all of the
   * replay matches, its last part matches the last part of the turn, so later text continues the
   * right part. A second replay of the same output therefore changes nothing.
   */
  replace(updates: readonly TurnUpdate[]): AHPChatAction[] {
    const replayed = foldReplay(updates);
    const kept = matchReplay(this.parts, replayed);
    const actions: AHPChatAction[] = [];

    for (const [index, part] of replayed.entries()) {
      const stored = this.parts[kept[index] ?? this.parts.length];

      if (part.kind === AHPResponsePartKind.ToolCall) {
        actions.push(...this.advanceTool(part.call));
      } else if (stored && stored.kind === part.kind) {
        const added = part.content.slice(stored.content.length);
        actions.push(...this.extendText(stored, added));
      } else {
        actions.push(this.addText(part.kind, part.content));
      }
    }

    return actions;
  }

  private extendText(part: TextPart, text: string): AHPChatAction[] {
    if (text === "") {
      return [];
    }

    part.content += text;
    const { turnId } = this;

    return [
      part.kind === AHPResponsePartKind.Markdown
        ? { type: AHPActionType.ChatDelta, turnId, partId: part.id, content: text }
        : { type: AHPActionType.ChatReasoning, turnId, partId: part.id, content: text },
    ];
  }

  /** Adds a text part. The first text part of a turn has the turn ID as its ID. */
  private addText(kind: TextKind, content: string): AHPChatAction {
    const taken = this.parts.some((part) => "id" in part && part.id === this.turnId);
    const id = taken ? `${this.turnId}:${crypto.randomUUID()}` : this.turnId;
    this.parts.push({ kind, id, content });

    return {
      type: AHPActionType.ChatResponsePart,
      turnId: this.turnId,
      part: { kind, id, content },
    };
  }

  /** Advances the part of a tool call to `call`, and adds the part if the turn has none. */
  private advanceTool(call: ToolCall): AHPChatAction[] {
    this.calls.set(call.toolCallId, call);

    const part = this.parts.find(
      (candidate): candidate is ToolPart =>
        candidate.kind === AHPResponsePartKind.ToolCall && candidate.toolCallId === call.toolCallId,
    );

    const { progress, actions } = advanceToolCall(this.turnId, part?.progress, call);

    if (part) {
      part.progress = progress;
    } else {
      this.parts.push({
        kind: AHPResponsePartKind.ToolCall,
        toolCallId: call.toolCallId,
        progress,
      });
    }

    return actions;
  }
}

/** Joins the updates of a replay into parts, as live updates would join them. */
function foldReplay(updates: readonly TurnUpdate[]): ReplayedPart[] {
  const parts: ReplayedPart[] = [];
  const calls: Map<string, { kind: AHPResponsePartKind.ToolCall; call: ToolCall }> = new Map();

  for (const update of updates) {
    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      const known = calls.get(update.toolCallId);
      const call = mergeToolCall(known?.call, update);

      if (known && call) {
        known.call = call;
      } else if (call) {
        const part = { kind: AHPResponsePartKind.ToolCall, call } as const;
        calls.set(call.toolCallId, part);
        parts.push(part);
      }

      continue;
    }

    const text = update.content.type === "text" ? update.content.text : "";
    const kind = textKindOf(update);
    const last = parts.at(LAST);

    if (last?.kind === kind) {
      last.content += text;
    } else if (text !== "") {
      parts.push({ kind, content: text });
    }
  }

  return parts;
}

/**
 * Returns the index of the stored part that each replayed part keeps, for the longest start of
 * the replay that matches the stored parts in order. If all of the replay matches, its last part
 * matches the last stored part.
 */
function matchReplay(stored: readonly OutputPart[], replayed: readonly ReplayedPart[]): number[] {
  for (let count = replayed.length; count > 0; count -= 1) {
    const all = count === replayed.length;
    const last = stored.length - 1;

    const head = matchInOrder(
      stored,
      replayed.slice(0, all ? count - 1 : count),
      all ? last : stored.length,
    );

    const tail = replayed[count - 1];
    const lastStored = stored[last];

    if (head && !all) {
      return head;
    }

    if (head && tail && lastStored && matches(lastStored, tail)) {
      return [...head, last];
    }
  }

  return [];
}

/** Matches each replayed part to the first matching stored part after the previous one. */
function matchInOrder(
  stored: readonly OutputPart[],
  replayed: readonly ReplayedPart[],
  end: number,
): number[] | undefined {
  const indexes: number[] = [];
  let next = 0;

  for (const part of replayed) {
    while (next < end && !matches(stored.at(next), part)) {
      next += 1;
    }

    if (next >= end) {
      return;
    }

    indexes.push(next);
    next += 1;
  }

  return indexes;
}

/** Returns true if the replayed part continues the stored part. */
function matches(stored: OutputPart | undefined, replayed: ReplayedPart): boolean {
  if (stored?.kind === AHPResponsePartKind.ToolCall) {
    return (
      replayed.kind === AHPResponsePartKind.ToolCall &&
      replayed.call.toolCallId === stored.toolCallId
    );
  }

  return (
    stored !== undefined &&
    replayed.kind !== AHPResponsePartKind.ToolCall &&
    stored.kind === replayed.kind &&
    replayed.content.startsWith(stored.content)
  );
}

function textKindOf(update: TextUpdate): TextKind {
  return update.sessionUpdate === "agent_message_chunk"
    ? AHPResponsePartKind.Markdown
    : AHPResponsePartKind.Reasoning;
}

/** Returns the output parts for a stored response part, if the output writes that kind. */
function outputPartsOf(part: AHPResponsePart): OutputPart[] {
  if (part.kind === AHPResponsePartKind.Markdown || part.kind === AHPResponsePartKind.Reasoning) {
    return [{ kind: part.kind, id: part.id, content: part.content }];
  }

  return part.kind === AHPResponsePartKind.ToolCall
    ? [
        {
          kind: part.kind,
          toolCallId: part.toolCall.toolCallId,
          progress: progressOf(part.toolCall),
        },
      ]
    : [];
}
