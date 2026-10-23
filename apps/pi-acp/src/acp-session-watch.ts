import { methods, type AgentContext, type SessionConfigOption } from "@agentclientprotocol/sdk";
import type { AgentEventStream, WatchEnd } from "@earendil-works/pi-durable";
import { AcpEventUpdates } from "./acp-events";
import type { SessionModel } from "./model-option";

type AcpSessionWatchParams = {
  sessionId: string;
  watch: AgentEventStream;
  client: AgentContext;
  signal: AbortSignal;
  /** Returns the config options of the session with `model`, sent when its model changes. */
  configOptionsOf?: (model: SessionModel | undefined) => SessionConfigOption[];
};

// Listens to the AgentEventStream from pi and converts its events.
export class AcpSessionEventsWatcher {
  private updates: AcpEventUpdates;
  private sessionId: string;
  private watch: AgentEventStream;
  private client: AgentContext;
  private signal: AbortSignal;

  constructor({ sessionId, watch, client, signal, configOptionsOf }: AcpSessionWatchParams) {
    this.sessionId = sessionId;
    this.watch = watch;
    this.client = client;
    this.signal = signal;
    // The snapshot contains the current message text and tool output.
    // The watch sends only subsequent output.
    this.updates = new AcpEventUpdates(watch.snapshot, configOptionsOf);
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
