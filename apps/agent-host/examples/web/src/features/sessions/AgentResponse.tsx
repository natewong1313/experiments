import type { JSX } from "react";
import { Badge } from "../../components/ui/badge";
import { RobotIcon } from "@phosphor-icons/react";
import { ResponseContent } from "./ResponseContent";
import type { ConversationTurnParams } from "./types";

function AgentResponse({ turn, streaming }: ConversationTurnParams): JSX.Element {
  const thinking = streaming && !turn.responseParts.length;
  const cancelled = "state" in turn && turn.state === "cancelled";

  return (
    <div className="flex items-start gap-3">
      <div
        aria-hidden="true"
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <RobotIcon size={16} />
      </div>
      <div className="grid min-w-0 flex-1 gap-2.5">
        <div className="flex items-center gap-2">
          <p className="m-0 text-sm font-medium">Agent</p>
          {streaming && <Badge>Responding…</Badge>}
          {cancelled && <Badge>Cancelled</Badge>}
        </div>
        {thinking ? (
          <p role="status" className="m-0 animate-pulse text-muted-foreground">
            Agent is thinking…
          </p>
        ) : (
          turn.responseParts.map((part, index) => <ResponseContent key={index} part={part} />)
        )}
      </div>
    </div>
  );
}

export { AgentResponse };
