import type {
  ChatAction as AHPChatAction,
  ResponsePart as AHPResponsePart,
} from "@microsoft/agent-host-protocol";
import type { PromptOutput } from "./agent-connection";
import { TurnParts } from "./turn-parts";

type ApplyAction = (turnId: string, action: AHPChatAction) => Promise<boolean>;

/**
 * Writes the output of a prompt run to the response parts of its turn. Text goes to markdown
 * parts, thinking to reasoning parts, and tool calls to tool call parts. A run gets at most one
 * replay, before its live updates, which brings the stored parts to the output of the agent so
 * far. The caller passes one output at a time, so the actions of each output apply in order.
 */
export class TurnOutput {
  private turnId: string;
  private apply: ApplyAction;
  private parts: TurnParts;

  /** `stored` holds the response parts of the turn so far, with their streamed text. */
  constructor(turnId: string, stored: readonly AHPResponsePart[], apply: ApplyAction) {
    this.turnId = turnId;
    this.apply = apply;
    this.parts = new TurnParts(turnId, stored);
  }

  async write(output: PromptOutput): Promise<void> {
    const actions =
      output.kind === "live" ? this.parts.apply(output.update) : this.parts.replace(output.updates);

    for (const action of actions) {
      // oxlint-disable-next-line no-await-in-loop -- the actions apply in order
      await this.apply(this.turnId, action);
    }
  }
}
