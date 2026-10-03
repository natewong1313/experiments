import type { SessionStatus } from "@microsoft/agent-host-protocol";

const SESSION_STATUS = {
  error: 2,
  inProgress: 8,
  inputNeeded: 24,
  archived: 64,
} satisfies Record<string, SessionStatus>;

type StatusFilter = "all" | "inProgress" | "inputNeeded" | "idle" | "error";

function sessionStatus(status: SessionStatus): string {
  if ((status & SESSION_STATUS.inputNeeded) === SESSION_STATUS.inputNeeded) {
    return "Input needed";
  }

  if (status & SESSION_STATUS.inProgress) {
    return "In progress";
  }

  if (status & SESSION_STATUS.error) {
    return "Error";
  }

  return "Idle";
}

function statusMatches(status: SessionStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case "all": {
      return true;
    }

    case "inProgress": {
      return Boolean(status & SESSION_STATUS.inProgress);
    }

    case "inputNeeded": {
      return (status & SESSION_STATUS.inputNeeded) === SESSION_STATUS.inputNeeded;
    }

    case "idle": {
      return (
        !(status & (SESSION_STATUS.inProgress | SESSION_STATUS.error)) &&
        (status & SESSION_STATUS.inputNeeded) !== SESSION_STATUS.inputNeeded
      );
    }

    case "error": {
      return Boolean(status & SESSION_STATUS.error);
    }
  }
}

export { SESSION_STATUS, sessionStatus, statusMatches };

export type { StatusFilter };
