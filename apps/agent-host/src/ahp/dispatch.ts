import type { DispatchActionParams } from "@experiments/protocol-schemas/ahp";
import type { Connection } from "./protocol";
import { rejection } from "./validation";
import type { HostStore } from "../state/store";
import type { AhpClients } from "./clients";
import type { TurnExecution } from "../sessions/turns";

type ActionDispatchParams = {
  store: HostStore;
  clients: AhpClients;
  turns: TurnExecution;
};

type ReadyConnection = Extract<Connection, { phase: "ready" }>;

class ActionDispatch {
  private readonly store: HostStore;
  private readonly clients: AhpClients;
  private readonly turns: TurnExecution;

  constructor({ store, clients, turns }: ActionDispatchParams) {
    this.store = store;
    this.clients = clients;
    this.turns = turns;
  }

  dispatch(socket: WebSocket, client: ReadyConnection, input: DispatchActionParams): void {
    const origin = { clientId: client.clientId, clientSeq: input.clientSeq };

    const frame = JSON.stringify({
      channel: input.channel,
      action: input.action,
    });

    const previous = this.store.previous(origin);

    if (previous) {
      const envelope =
        previous.frame === frame
          ? previous.envelope
          : {
              channel: input.channel,
              action: input.action,
              origin,
              serverSeq: this.store.sequence,
              rejectionReason: "Client sequence was reused for another action",
            };

      this.clients.sendAction(socket, envelope);

      return;
    }

    const record = this.store.lookup(input.channel);

    if (!record) {
      return;
    }

    let reason = rejection(record, input.channel, input.action, (turnId) =>
      this.store.hasTurn(record.chatUri, turnId),
    );

    if (input.action.type === "chat/turnStarted" && this.turns.isRunning(record)) {
      reason = "The previous agent turn is still stopping";
    }

    const dispatch: Parameters<HostStore["dispatch"]>[0] = {
      ...input,
      record,
      origin,
      frame,
    };

    if (reason !== void 0) {
      dispatch.rejection = reason;
    }

    const publication = this.store.dispatch(dispatch);

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
