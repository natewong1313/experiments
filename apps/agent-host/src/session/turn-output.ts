import {
  ActionType as AHPActionType,
  ResponsePartKind as AHPResponsePartKind,
} from "@microsoft/agent-host-protocol";
import type { ChatAction as AHPChatAction } from "@microsoft/agent-host-protocol";
import type { PromptText } from "./agent-connection";
import type { MarkdownText } from "./chat/turn-rows";

/**
 * Writes the text of a prompt run to a markdown part of its turn. A run gets at most one
 * snapshot, before its deltas. The snapshot holds all the text of the turn so far: the output
 * appends what it adds to the stored part, or writes it to a new markdown part if it does not
 * extend the stored part, as after the agent retried a generation. A delta appends to the part.
 */
export class TurnOutput {
  private turnId: string;
  private part: MarkdownText;
  private apply: (turnId: string, action: AHPChatAction) => Promise<boolean>;

  constructor(
    turnId: string,
    part: MarkdownText,
    apply: (turnId: string, action: AHPChatAction) => Promise<boolean>,
  ) {
    this.turnId = turnId;
    this.part = part;
    this.apply = apply;
  }

  async write({ kind, text }: PromptText): Promise<void> {
    if (kind === "delta") {
      await this.append(text);

      return;
    }

    const stored = this.part.content;

    if (text.startsWith(stored)) {
      await this.append(text.slice(stored.length));

      return;
    }

    this.part = { id: `${this.turnId}:${crypto.randomUUID()}`, content: text };

    await this.apply(this.turnId, {
      type: AHPActionType.ChatResponsePart,
      turnId: this.turnId,
      part: { kind: AHPResponsePartKind.Markdown, ...this.part },
    });
  }

  private async append(content: string): Promise<void> {
    if (content === "") {
      return;
    }

    await this.apply(this.turnId, {
      type: AHPActionType.ChatDelta,
      turnId: this.turnId,
      partId: this.part.id,
      content,
    });
  }
}
