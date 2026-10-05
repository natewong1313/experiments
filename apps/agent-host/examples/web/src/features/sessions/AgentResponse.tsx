import { useCallback, useState, type JSX } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { RobotIcon } from "@phosphor-icons/react";
import { ResponseContent } from "./ResponseContent";
import type { ConversationTurnParams } from "./types";

const NO_PARTS = 0;

const VISIBLE_PARTS = 100;

function AgentResponse({ turn, streaming }: ConversationTurnParams): JSX.Element {
  const [visibleCount, setVisibleCount] = useState(VISIBLE_PARTS);
  const start = Math.max(NO_PARTS, turn.responseParts.size - visibleCount);
  const thinking = streaming && !turn.responseParts.size;
  const cancelled = "state" in turn && turn.state === "cancelled";

  const showEarlierOutput = useCallback(() => {
    setVisibleCount((count) => count + VISIBLE_PARTS);
  }, []);

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
        {start > NO_PARTS && (
          <Button variant="ghost" onClick={showEarlierOutput}>
            Show earlier output
          </Button>
        )}
        {thinking ? (
          <p role="status" className="m-0 animate-pulse text-muted-foreground">
            Agent is thinking…
          </p>
        ) : (
          turn.responseParts
            .slice(start)
            .map((part, index) => <ResponseContent key={start + index} part={part} />)
            .toArray()
        )}
      </div>
    </div>
  );
}

export { AgentResponse };
