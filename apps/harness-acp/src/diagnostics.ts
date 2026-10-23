import type { AgentEvent } from "@earendil-works/pi-durable";

/** The timing of a session that a client can log. A diagnostic never holds model content. */
type DiagnosticEvent =
  | {
      event:
        | "run_start"
        | "run_end"
        | "turn_start"
        | "message_start"
        | "first_message_update"
        | "auto_retry_end";
    }
  | { event: "auto_retry_start"; attempt: number; retryAt: number; errorMessage: string }
  | { event: "deferred_poll"; pollAt: number }
  | { event: "first_update_forwarded"; updateType: string };

export type AcpDiagnostic = DiagnosticEvent & { sessionId: string; timestamp: string };

export type AcpDiagnosticListener = (diagnostic: AcpDiagnostic) => void;

type AcpDiagnosticsParams = {
  sessionId: string;
  onDiagnostic: AcpDiagnosticListener;
};

/**
 * Records the timing of one session from its agent events and the updates that the client
 * receives. It records one event per model turn for the first message update and for the first
 * forwarded update, so a client can tell a stalled turn from a slow one.
 */
export class AcpDiagnostics {
  private readonly sessionId: string;
  private readonly onDiagnostic: (diagnostic: AcpDiagnostic) => void;
  private messageUpdated = false;
  private forwarded = false;

  constructor({ sessionId, onDiagnostic }: AcpDiagnosticsParams) {
    this.sessionId = sessionId;
    this.onDiagnostic = onDiagnostic;
  }

  /** Records the timing event that `event` reports, if it reports one. */
  record(event: AgentEvent): void {
    switch (event.type) {
      case "run_start":
      case "turn_start":
      case "message_start": {
        this.messageUpdated = false;
        this.forwarded = false;
        this.report({ event: event.type });
        break;
      }

      case "run_end":
      case "auto_retry_end": {
        this.report({ event: event.type });
        break;
      }

      case "message_update": {
        if (!this.messageUpdated) {
          this.messageUpdated = true;
          this.report({ event: "first_message_update" });
        }

        break;
      }

      case "auto_retry_start": {
        this.report({
          event: event.type,
          attempt: event.attempt,
          retryAt: event.at,
          errorMessage: event.errorMessage,
        });
        break;
      }

      case "deferred_poll": {
        this.report({ event: event.type, pollAt: event.pollAt });
        break;
      }

      default: {
        break;
      }
    }
  }

  /** Records the first update that the client received in the current model turn. */
  recordForwarded(updateType: string): void {
    if (this.forwarded) {
      return;
    }

    this.forwarded = true;
    this.report({ event: "first_update_forwarded", updateType });
  }

  private report(event: DiagnosticEvent): void {
    try {
      this.onDiagnostic({
        ...event,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("ACP diagnostic callback failed", { sessionId: this.sessionId, error });
    }
  }
}
