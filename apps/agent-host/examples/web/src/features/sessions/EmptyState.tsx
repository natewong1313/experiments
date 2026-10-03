import type { JSX } from "react";
import { RobotIcon } from "@phosphor-icons/react";

function EmptyState(): JSX.Element {
  return (
    <div className="grid justify-items-center gap-3 py-16 text-center">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <RobotIcon size={24} />
      </div>
      <div className="grid gap-1">
        <p className="m-0 font-medium">Start the conversation</p>
        <p className="m-0 text-sm text-muted-foreground">
          Send a message and the agent will respond here.
        </p>
      </div>
    </div>
  );
}

export { EmptyState };
