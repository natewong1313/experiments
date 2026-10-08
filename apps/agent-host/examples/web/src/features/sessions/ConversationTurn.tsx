import type { JSX } from "react";
import { AgentResponse } from "./AgentResponse";
import { UserMessage } from "./UserMessage";
import type { ConversationTurnParams } from "./types";

export function ConversationTurn({ turn, streaming }: ConversationTurnParams): JSX.Element {
  return (
    <article className="grid gap-4" aria-label={streaming ? "Active turn" : "Completed turn"}>
      <UserMessage turn={turn} />
      <AgentResponse turn={turn} streaming={streaming} />
    </article>
  );
}
