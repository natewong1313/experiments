import { methods, type AgentContext } from "@agentclientprotocol/sdk";
import type { AgentEventStream, WatchEnd } from "@earendil-works/pi-durable";
import { AcpEventUpdates } from "./acp-events";

type AcpSessionWatchParams = {
  sessionId: string;
  watch: AgentEventStream;
  client: AgentContext;
  signal: AbortSignal;
};

// Listens to the AgentEventStream from pi and converts them.
export class AcpSessionEventsWatcher {
  private updates = new AcpEventUpdates();
  private sessionId: string;
  private watch: AgentEventStream;
  private client: AgentContext;
  private signal: AbortSignal;

  constructor({ sessionId, watch, client, signal }: AcpSessionWatchParams) {
    this.sessionId = sessionId;
    this.watch = watch;
    this.client = client;
    this.signal = signal;
  }

  start(): void {
    this.watch.start(async (events) => {
      for (const event of events) {
        if (this.signal.aborted) {
          return;
        }

        for (const update of this.updates.update(event)) {
          if (this.signal.aborted) {
            return;
          }

          try {
            // eslint-disable-next-line no-await-in-loop
            await this.client.notify(methods.client.session.update, {
              sessionId: this.sessionId,
              update,
            });
          } catch (error) {
            if (this.signal.aborted) {
              return;
            }

            throw error;
          }
        }
      }
    });
    void this.watch.closed.then((end) => {
      if (end.reason === "listener_error") {
        console.error("ACP event watch terminated", {
          sessionId: this.sessionId,
          reason: end.reason,
          error: end.error,
        });
      }
    });
  }

  stop(): Promise<WatchEnd> {
    return this.watch.stop();
  }
}
