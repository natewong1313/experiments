import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { PiHarness, PiSession } from "agents/harness/pi";
import { AcpEventUpdates } from "./acp-events";
import { textChunks } from "./frame-limits";
import type { AcpHarness, HarnessSession } from "./harness";
import type { AcpModel } from "./model-option";
import { modelConfigOptions } from "./model-option";
import { operationUpdates, operationUsage, promptEntry, responseOf } from "./operations";

export function piHarness(harness: PiHarness, models: readonly AcpModel[]): AcpHarness {
  function wrap(session: PiSession): HarnessSession {
    return {
      id: session.id,
      async currentModel() {
        const events = await session.events();

        try {
          return events.snapshot.agent.model;
        } finally {
          await events.stop();
        }
      },
      setModel: (model) => session.setModel(model),
      busy: () => session.busy(),
      async known(id) {
        const pending = await harness.pending({ session: session.id });

        if (pending.some((operation) => operation.operationId === id)) {
          return true;
        }

        const result = await session.wait(id);

        return result.reason !== "not_found";
      },
      async prompt(text, id) {
        const result = await session.prompt([{ type: "text", text }], {
          operationId: id,
          entry: promptEntry(id),
        });

        const messages = await session.messages();

        return responseOf(result, operationUsage(messages, id));
      },
      async wait(id) {
        const result = await session.wait(id);

        const messages = await session.messages();

        return responseOf(result, operationUsage(messages, id));
      },
      async abort() {
        await session.abort();
      },
      async history() {
        const messages = await session.messages();

        return messages.flatMap((entry): SessionUpdate[] => {
          const message = entry.model?.[0];
          if (!message || (message.role !== "user" && message.role !== "assistant")) {
            return [];
          }

          const content = Array.isArray(message.content)
            ? message.content
            : [{ type: "text", text: message.content }];

          return content.flatMap((part) =>
            part.type === "text"
              ? textChunks(part.text).map((text) => ({
                  sessionUpdate:
                    message.role === "user"
                      ? ("user_message_chunk" as const)
                      : ("agent_message_chunk" as const),
                  content: { type: "text" as const, text },
                }))
              : [],
          );
        });
      },
      async watch(send, signal) {
        const watch = await session.events();

        const updates = new AcpEventUpdates(
          watch.snapshot,
          models.length
            ? (model): ReturnType<typeof modelConfigOptions> => modelConfigOptions(models, model)
            : undefined,
        );

        let delivery = Promise.resolve();

        return {
          replay: (id) => operationUpdates(watch.snapshot, id),
          flush: () => delivery,
          start() {
            watch.start((events) => {
              delivery = (async (): Promise<void> => {
                for (const event of events) {
                  for (const update of updates.update(event)) {
                    if (signal.aborted) {
                      return;
                    }

                    await send(update);
                  }
                }
              })();

              return delivery;
            });
            void (async (): Promise<void> => {
              const end = await watch.closed;
              if (end.reason === "listener_error") {
                console.error("ACP event watch terminated", {
                  sessionId: session.id,
                  error: end.error,
                });
              }
            })();
          },
          async stop() {
            await watch.stop();
          },
        };
      },
    };
  }

  return {
    create: async () => wrap(await harness.sessions.create()),
    list: () => harness.sessions.list(),
    session: (id) => wrap(harness.session(id)),
  };
}
