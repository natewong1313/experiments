import type { PromptResponse } from "@agentclientprotocol/sdk";
import type { OpenCodeHarness } from "agents/harness/opencode";
import type { AcpHarness, HarnessSession } from "./harness";
import type { AcpModel, SessionModel } from "./model-option";
import { modelConfigOptions } from "./model-option";
import {
  messageUpdates,
  OpenCodeUpdates,
  operationMessages,
  operationUsage,
} from "./opencode-events";
import { responseOf } from "./operations";

export function openCodeHarness(harness: OpenCodeHarness, models: readonly AcpModel[]): AcpHarness {
  function wrap(id: string): HarnessSession {
    const session = harness.session(id);

    async function currentModel(): Promise<SessionModel | undefined> {
      const info = await harness.use((code) => code.sessions.get({ sessionID: id }));

      return info.model ? { provider: info.model.providerID, modelId: info.model.id } : undefined;
    }

    async function wait(operationId: string): Promise<PromptResponse> {
      const result = await session.wait(operationId);

      const history = await session.history();
      const messages = operationMessages(history, operationId);

      return responseOf(result, operationUsage(messages));
    }

    return {
      id,
      currentModel,
      setModel: (model) => session.setModel({ providerID: model.provider, id: model.id }),
      busy: () => session.busy(),
      async known(operationId) {
        const pending = await harness.pending({ session: id });

        if (pending.some((operation) => operation.operationId === operationId)) {
          return true;
        }

        const result = await session.wait(operationId);

        return result.reason !== "not_found";
      },
      async prompt(text, operationId) {
        await session.submit(text, { operationId });

        return wait(operationId);
      },
      wait,
      async abort() {
        await session.abort();
      },
      async history() {
        const messages = await session.history();

        return messages.flatMap((message) => messageUpdates(message));
      },
      async watch(send, signal) {
        const watch = await session.events();
        const updates = new OpenCodeUpdates(watch.snapshot.messages);
        let queue = Promise.resolve();
        let failure: Error | undefined;

        return {
          replay: (operationId) =>
            operationMessages(watch.snapshot.messages, operationId).flatMap((message) =>
              messageUpdates(message),
            ),
          start() {
            watch.start((events) => {
              const previous = queue;
              queue = (async (): Promise<void> => {
                try {
                  await previous;

                  if (failure) {
                    return;
                  }

                  for (const event of events) {
                    if (signal.aborted) {
                      return;
                    }

                    for (const update of updates.update(event)) {
                      await send(update);
                    }

                    if (event.type === "message_start" && models.length) {
                      await send({
                        sessionUpdate: "config_option_update",
                        configOptions: modelConfigOptions(models, {
                          provider: event.model.providerID,
                          modelId: event.model.id,
                        }),
                      });
                    }
                  }
                } catch (error) {
                  failure = error instanceof Error ? error : new Error(String(error));
                  console.error("ACP event watch terminated", { sessionId: id, error });
                  void watch.stop();
                }
              })();
            });
          },
          async flush() {
            await queue;

            if (failure) {
              throw failure;
            }
          },
          async stop() {
            await watch.stop();
            await queue;
          },
        };
      },
    };
  }

  return {
    async create() {
      const session = await harness.sessions.create();

      return wrap(session.id);
    },
    list: () => harness.sessions.list(),
    session: wrap,
  };
}
