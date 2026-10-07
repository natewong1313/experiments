import type { DispatchActionParams } from "@experiments/protocol-schemas/ahp";
import type { Connection } from "./protocol";
import { rejection } from "./validation";
import type { HostQueries, HostMutations } from "../state";
import type { AhpClients } from "./clients";
import type { TurnExecution } from "../sessions/turns";

type ActionDispatchParams = {
  queries: HostQueries;
  mutations: HostMutations;
  clients: AhpClients;
  turns: TurnExecution;
};

type ReadyConnection = Extract<Connection, { phase: "ready" }>;

class ActionDispatch {
  private readonly queries: HostQueries;
  private readonly mutations: HostMutations;
  private readonly clients: AhpClients;
  private readonly turns: TurnExecution;

  constructor({ queries, mutations, clients, turns }: ActionDispatchParams) {
    this.queries = queries;
    this.mutations = mutations;
    this.clients = clients;
    this.turns = turns;
  }

  dispatch(socket: WebSocket, client: ReadyConnection, input: DispatchActionParams): void {
    const origin = { clientId: client.clientId, clientSeq: input.clientSeq };

    const frame = JSON.stringify({
      channel: input.channel,
      action: input.action,
    });

    const previous = this.queries.lookupDispatchResult(origin);

    if (previous) {
      const envelope =
        previous.frame === frame
          ? previous.envelope
          : {
              channel: input.channel,
              action: input.action,
              origin,
              serverSeq: this.queries.sequence,
              rejectionReason: "Client sequence was reused for another action",
            };

      this.clients.sendAction(socket, envelope);

      return;
    }

    const record = this.queries.lookupMetadata(input.channel);

    if (!record) {
      return;
    }

    let reason = rejection(record, input.channel, input.action, (turnId) =>
      this.queries.hasCompletedTurn(record.chatUri, turnId),
    );

    if (input.action.type === "chat/turnStarted" && this.turns.isRunning(record)) {
      reason = "The previous agent turn is still stopping";
    }

    const dispatch: Parameters<HostMutations["commitDispatch"]>[0] = {
      ...input,
      record,
      origin,
      frame,
    };

    if (reason !== void 0) {
      dispatch.rejection = reason;
    }

    const publication = this.mutations.commitDispatch(dispatch);

    const [acknowledgement] = publication.actions;

    if (reason !== void 0) {
      this.clients.sendAction(socket, acknowledgement);

      return;
    }

    this.clients.broadcast(publication);

    if (input.action.type === "chat/turnStarted") {
      this.turns.start(record, input.action.turnId);
    }

    if (input.action.type === "chat/turnCancelled") {
      this.turns.cancel(record);
    }
  }
}

export { ActionDispatch };
