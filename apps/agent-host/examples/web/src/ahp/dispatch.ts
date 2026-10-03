import type { AhpClient } from "@microsoft/agent-host-protocol/client";
import type { StateAction as SdkAction } from "@microsoft/agent-host-protocol";
import { StateActionSchema, type StateAction } from "@experiments/protocol-schemas/ahp";

const ABSENT = void 0;

const ACK_TIMEOUT_MS = 15_000;

async function dispatchAction({
  client,
  clientId,
  channel,
  action,
}: {
  client: AhpClient;
  clientId: string;
  channel: string;
  action: StateAction;
}): Promise<void> {
  const events = client.events();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    // SAFETY: StateActionSchema validates the wire values used by the SDK's nominal action enums.
    const validated = StateActionSchema.parse(action) as SdkAction;
    const { clientSeq } = client.dispatch(channel, validated);

    async function acknowledge(): Promise<void> {
      for await (const item of events) {
        if (item.channel !== channel || item.event.type !== "action") {
          continue;
        }

        const envelope = item.event.params;

        if (envelope.origin?.clientId !== clientId || envelope.origin.clientSeq !== clientSeq) {
          continue;
        }

        if (envelope.rejectionReason !== ABSENT) {
          throw new Error(envelope.rejectionReason);
        }

        return;
      }

      throw new Error(
        "Connection closed before the host acknowledged the message. Check the conversation before sending again.",
      );
    }

    const timeout: Promise<never> = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            "The host did not acknowledge the message. Check the conversation before sending again.",
          ),
        );
      }, ACK_TIMEOUT_MS);
    });

    await Promise.race([acknowledge(), timeout]);
  } finally {
    clearTimeout(timer);
    await events.return?.();
  }
}

export { dispatchAction };
