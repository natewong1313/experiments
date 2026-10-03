import type { JSX } from "react";
import type { ConversationTurnParams } from "./types";

function UserMessage({ turn }: Pick<ConversationTurnParams, "turn">): JSX.Element {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5">
        <p className="m-0 whitespace-pre-wrap leading-relaxed">{turn.message.text}</p>
      </div>
    </div>
  );
}

export { UserMessage };
