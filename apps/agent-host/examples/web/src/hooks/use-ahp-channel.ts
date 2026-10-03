import { useEffect, useState } from "react";
import type { Snapshot, StateAction } from "@microsoft/agent-host-protocol";
import type { AhpClient } from "@microsoft/agent-host-protocol/client";
import { acquireChannel } from "../ahp/subscriptions";

const ABSENT = void 0;

type ChannelView<State> =
  | { status: "loading" }
  | { status: "ready"; state: State }
  | { status: "error"; message: string };

type ParseState<State> = (value: Snapshot["state"]) => State;

type ReduceState<State> = (state: State, action: StateAction) => State;

function useAhpChannel<State>({
  client,
  uri,
  parse,
  reduce,
}: {
  client: AhpClient | undefined;
  uri: string | undefined;
  parse: ParseState<State>;
  reduce: ReduceState<State>;
}): ChannelView<State> {
  const [current, setCurrent] = useState<{
    client: AhpClient;
    uri: string;
    view: ChannelView<State>;
  } | null>(null);

  useEffect(() => {
    if (!client || uri === ABSENT) {
      return;
    }

    const connection = client;
    const resource = uri;
    const lifetime = new AbortController();
    const lease = acquireChannel(connection, resource);

    function publish(view: ChannelView<State>): void {
      if (!lifetime.signal.aborted) {
        setCurrent({ client: connection, uri: resource, view });
      }
    }

    async function watch(): Promise<void> {
      try {
        const { result, subscription } = await lease.result;
        await subscription.close();
        const { snapshot } = result;

        if (!snapshot || snapshot.resource !== resource) {
          throw new Error("The host did not return a snapshot for this resource.");
        }

        let state = parse(snapshot.state);
        let serverSeq = snapshot.fromSeq;
        publish({ status: "ready", state });

        for await (const event of lease.subscription) {
          if (
            event.type !== "action" ||
            event.params.rejectionReason !== ABSENT ||
            event.params.serverSeq <= serverSeq
          ) {
            continue;
          }

          state = reduce(state, event.params.action);
          ({ serverSeq } = event.params);
          publish({ status: "ready", state });
        }

        throw new Error("The resource subscription closed.");
      } catch (error) {
        publish({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    void watch();

    return (): void => {
      lifetime.abort();
      lease.release();
    };
  }, [client, uri, parse, reduce]);

  if (current && current.client === client && current.uri === uri) {
    return current.view;
  }

  return { status: "loading" };
}

export { useAhpChannel };
