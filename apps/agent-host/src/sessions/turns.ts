import {
  acpUpdateToChatActions,
  type SessionNotification,
} from "@experiments/protocol-schemas/acp";
import type { StateAction } from "@experiments/protocol-schemas/ahp";
import { errorMessage } from "../ahp/protocol";
import { withDeadline } from "../deadline";
import type { AhpClients } from "../ahp/clients";
import type { HostStore } from "../state/store";
import type { AgentConnections } from "../agent/acp";
import type { LiveSession, SessionGeneration } from "./record";
import { MemoryLimitError } from "../memory";

const CANCEL_TIMEOUT_MS = 10_000;

type WaitUntil = (work: Promise<void>) => void;

function turnDuration(startedAt: string): number {
  return Math.max(0, Date.now() - Date.parse(startedAt));
}

type TurnExecutionParams = {
  store: HostStore;
  agents: AgentConnections;
  clients: AhpClients;
  waitUntil: WaitUntil;
};

class TurnExecution {
  private readonly running: Map<string, Promise<void>> = new Map();
  private readonly store: HostStore;
  private readonly agents: AgentConnections;
  private readonly clients: AhpClients;
  private readonly waitUntil: WaitUntil;

  constructor({ store, agents, clients, waitUntil }: TurnExecutionParams) {
    this.store = store;
    this.agents = agents;
    this.clients = clients;
    this.waitUntil = waitUntil;
  }

  isRunning(record: SessionGeneration): boolean {
    return this.running.has(record.sessionKey);
  }

  start(record: LiveSession, turnId: string): void {
    const work = this.runTurn(record, turnId);
    this.running.set(record.sessionKey, work);
    this.waitUntil(work);
  }

  cancel(record: LiveSession): void {
    this.waitUntil(this.cancelTurn(record));
  }

  recover(record: LiveSession): void {
    if (record.chat.activeTurn) {
      this.failTurn(record, "The host restarted. This turn was interrupted.", "interrupted");
    }
  }

  onAgentUpdate(identity: SessionGeneration, notification: SessionNotification): void {
    const record = this.store.lookup(identity.uri);

    if (
      !record ||
      record.sessionKey !== identity.sessionKey ||
      record.acpSession !== notification.sessionId
    ) {
      return;
    }

    try {
      const actions = acpUpdateToChatActions(record.chat.activeTurn, notification);

      for (const publication of this.store.updateChat(record, actions)) {
        this.clients.broadcast(publication);
      }
    } catch (error) {
      if (!(error instanceof MemoryLimitError)) {
        throw error;
      }

      this.failTurn(record, error.message, "resource-limit");
      this.waitUntil(this.agents.release(identity));
    }
  }

  private failTurn(record: LiveSession, message: string, errorType = "agent"): void {
    const turn = record.chat.activeTurn;

    if (!turn) {
      return;
    }

    this.publish(record.chatUri, {
      type: "chat/error",
      turnId: turn.id,
      duration: turnDuration(turn.startedAt),
      part: {
        kind: "error",
        error: { errorType, message },
        resumable: false,
      },
    });
  }

  private async runTurn(original: LiveSession, turnId: string): Promise<void> {
    const { uri } = original;

    try {
      const agent = await this.agents.get(original);
      const current = this.store.lookup(uri);
      const turn = current?.chat.activeTurn;

      if (!turn || turn.id !== turnId || current.sessionKey !== original.sessionKey) {
        return;
      }

      const outcome = await agent.prompt(turn.message);
      const latest = this.store.lookup(uri);

      if (latest?.chat.activeTurn?.id !== turnId || latest.sessionKey !== original.sessionKey) {
        return;
      }

      if (outcome.outcome === "failed") {
        this.failTurn(latest, outcome.message);

        return;
      }

      const action: StateAction =
        outcome.outcome === "cancelled"
          ? {
              type: "chat/turnCancelled",
              turnId,
              duration: turnDuration(turn.startedAt),
            }
          : {
              type: "chat/turnComplete",
              turnId,
              duration: turnDuration(turn.startedAt),
            };

      this.publish(latest.chatUri, action);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("Agent operation failed");

      const record = this.store.lookup(uri);

      if (record?.chat.activeTurn?.id === turnId && record.sessionKey === original.sessionKey) {
        this.failTurn(record, errorMessage(failure));
      }

      await this.agents.release(original);
    } finally {
      this.running.delete(original.sessionKey);
      await this.agents.idle(original);
    }
  }

  private async cancelTurn(record: LiveSession): Promise<void> {
    try {
      const agent = await this.agents.get(record);
      await agent.cancel();
      const running = this.running.get(record.sessionKey);

      if (running) {
        await withDeadline(running, CANCEL_TIMEOUT_MS, () => {
          agent.abort();
        });
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error("Agent operation failed");

      console.error({
        event: "agent_cancel_failed",
        session: record.uri,
        error: errorMessage(failure),
      });
      await this.agents.release(record);
    }
  }

  private publish(channel: string, action: StateAction): void {
    this.clients.broadcast(this.store.apply(channel, action));
  }
}

export { TurnExecution };
