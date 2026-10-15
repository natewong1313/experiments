import { waitUntil } from "cloudflare:workers";
import type { Stream as ACPStream } from "@agentclientprotocol/sdk";
import {
  ActionType as AHPActionType,
  ResponsePartKind as AHPResponsePartKind,
  SessionLifecycle as AHPSessionLifecycle,
  MessageKind as AHPMessageKind,
} from "@microsoft/agent-host-protocol";
import type {
  ActionOrigin as AHPActionOrigin,
  ChatAction as AHPChatAction,
  ChatTurnStartedAction as AHPChatTurnStartedAction,
} from "@microsoft/agent-host-protocol";
import type {
  ChatTurnStartedAction as TurnStartedRequest,
  ChatTurnCancelledAction as TurnCancelledRequest,
} from "@experiments/protocol-schemas/ahp";
import { errorMessage } from "../../shared/errors";
import type {
  SessionCreateRequest,
  SessionDispatchRequest,
  SessionSnapshotRequest,
  SessionSnapshotResponse,
} from "../../shared/rpc/session";
import type { HostRPC, HostSessionUpdateRequest } from "../../shared/rpc/host";
import { sessionUri } from "../../shared/lookups";
import type { SessionDatabase } from "../db/database";
import type { SessionRecord } from "../db/schema";
import { applyChat, applySession, buildSession } from "../state";
import { AgentConnection } from "./agent";

type SessionOptions = {
  db: SessionDatabase;
  workingDirectory(): string;
  hostNamespace(): DurableObjectNamespace<HostRPC>;
  connectAgent(sessionId: string): Promise<ACPStream>;
};

// Mutates the record and returns the update to publish, or undefined to leave it unchanged.
type Change = (record: SessionRecord) => HostSessionUpdateRequest | undefined;

type Publication = { hostId: string; update: HostSessionUpdateRequest };

function assertReady(record: SessionRecord): void {
  if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
    throw new Error("Session is not ready");
  }
}

export class SessionService {
  // Covers a turn's whole prompt run, which can outlast the active turn after cancellation.
  private promptRunning = false;
  private publications = Promise.resolve();
  private readonly agent = new AgentConnection();
  private readonly options: SessionOptions;

  constructor(options: SessionOptions) {
    this.options = options;
  }

  async load(): Promise<void> {
    const interrupted = this.apply((record) => {
      const turn = record.chatState.activeTurn;

      return (
        turn &&
        applyChat(record, {
          type: AHPActionType.ChatError,
          turnId: turn.id,
          duration: 0,
          part: {
            kind: AHPResponsePartKind.Error,
            error: { errorType: "agent", message: "Turn interrupted by session restart" },
          },
        })
      );
    });

    if (interrupted) {
      waitUntil(interrupted);
    }
  }

  async create(options: SessionCreateRequest): Promise<void> {
    const cwd = options.workingDirectory ?? this.options.workingDirectory();

    if (!cwd.startsWith("/")) {
      throw new Error("Working directory must be an absolute path");
    }

    await this.options.db.transaction(async () => {
      if (await this.options.db.session.get()) {
        throw new Error("Session already exists");
      }

      await this.options.db.session.create(buildSession(options, cwd));
    });

    try {
      await this.openAgent();
      await this.applyExisting((record) =>
        applySession(record, { type: AHPActionType.SessionReady }),
      );
    } catch (error) {
      this.agent.close();

      try {
        await this.apply((record) =>
          applySession(record, {
            type: AHPActionType.SessionCreationFailed,
            error: { errorType: "agent", message: errorMessage(error) },
          }),
        );
      } finally {
        await this.options.db.session.remove();
      }

      throw error;
    }
  }

  async snapshot(req: SessionSnapshotRequest): Promise<SessionSnapshotResponse> {
    const record = await this.options.db.session.get();

    if (!record) {
      throw new Error("Session does not exist");
    }

    const sessionChannel = sessionUri(record.id);

    if (req.channel !== sessionChannel && req.channel !== record.sessionState.defaultChat) {
      throw new Error("Channel does not belong to this session");
    }

    return {
      revision: record.revision,
      state: req.channel === sessionChannel ? record.sessionState : record.chatState,
    };
  }

  async dispatch({ action, origin }: SessionDispatchRequest): Promise<void> {
    if (action.type === "chat/turnStarted") {
      this.startTurn(action, origin);
    } else {
      await this.cancelTurn(action, origin);
    }
  }

  async dispose(): Promise<void> {
    try {
      await this.options.db.session.remove();
      await this.agent.cancel();
    } finally {
      this.agent.close();
    }
  }

  private startTurn(request: TurnStartedRequest, origin: AHPActionOrigin): void {
    const { message } = request;

    if (
      message.origin.kind !== "user" ||
      (message.attachments?.length ?? 0) > 0 ||
      message.model ||
      message.agent
    ) {
      throw new Error("Only user text messages are supported");
    }

    const action: AHPChatTurnStartedAction = {
      type: AHPActionType.ChatTurnStarted,
      turnId: request.turnId,
      startedAt: request.startedAt,
      message: { text: message.text, origin: { kind: AHPMessageKind.User } },
    };

    const started = this.applyExisting((record) => {
      assertReady(record);

      if (record.chatState.activeTurn || this.promptRunning) {
        throw new Error("A turn is already running");
      }

      if (record.chatState.turns.some((turn) => turn.id === action.turnId)) {
        throw new Error("Turn ID already exists");
      }

      return applyChat(record, action, origin);
    });

    this.promptRunning = true;
    waitUntil(this.runPrompt(action, started));
  }

  private async cancelTurn(request: TurnCancelledRequest, origin: AHPActionOrigin): Promise<void> {
    const cancelled = this.applyExisting((record) => {
      assertReady(record);

      if (record.chatState.activeTurn?.id !== request.turnId) {
        throw new Error("No matching active turn to cancel");
      }

      return applyChat(record, { ...request, type: AHPActionType.ChatTurnCancelled }, origin);
    });

    await Promise.all([cancelled, this.agent.cancel()]);
  }

  private async openAgent(): Promise<void> {
    const record = await this.options.db.session.get();

    if (!record) {
      throw new Error("Session does not exist");
    }

    const acpSessionId = await this.agent.open({
      stream: (): Promise<ACPStream> => this.options.connectAgent(record.id),
      cwd: record.cwd,
      sessionId: record.acpSessionId,
    });

    if (acpSessionId !== record.acpSessionId) {
      await this.options.db.session.setAcpSessionId(record.id, acpSessionId);
    }
  }

  private async runPrompt(action: AHPChatTurnStartedAction, started: Promise<void>): Promise<void> {
    const { turnId } = action;
    const startedAt = Date.now();

    try {
      await started;
      await this.openAgent();

      const responding = this.applyToTurn(turnId, {
        type: AHPActionType.ChatResponsePart,
        turnId,
        part: { kind: AHPResponsePartKind.Markdown, id: turnId, content: "" },
      });

      if (!responding) {
        return;
      }

      await responding;

      const response = await this.agent.prompt(action.message.text, async (content) => {
        await this.applyToTurn(turnId, {
          type: AHPActionType.ChatDelta,
          turnId,
          partId: turnId,
          content,
        });
      });

      await this.applyToTurn(turnId, {
        type:
          response.stopReason === "cancelled"
            ? AHPActionType.ChatTurnCancelled
            : AHPActionType.ChatTurnComplete,
        turnId,
        duration: Date.now() - startedAt,
      });
    } catch (error) {
      await this.applyToTurn(turnId, {
        type: AHPActionType.ChatError,
        turnId,
        duration: Date.now() - startedAt,
        part: {
          kind: AHPResponsePartKind.Error,
          error: { errorType: "agent", message: errorMessage(error) },
        },
      });
    } finally {
      this.promptRunning = false;
    }
  }

  // Skipped once the turn is no longer active, for example after cancellation.
  private applyToTurn(turnId: string, action: AHPChatAction): Promise<void> | undefined {
    return this.apply((record) =>
      record.chatState.activeTurn?.id === turnId ? applyChat(record, action) : undefined,
    );
  }

  private applyExisting(
    change: (record: SessionRecord) => HostSessionUpdateRequest,
  ): Promise<void> {
    const published = this.apply(change);

    if (!published) {
      throw new Error("Session does not exist");
    }

    return published;
  }

  /**
   * Changes the record atomically and queues its publication.
   * Returns undefined when the session does not exist or `change` skipped it.
   */
  private apply(change: Change): Promise<void> | undefined {
    const publication = this.options.db.session.update((record): Publication | undefined => {
      const update = change(record);

      return update && { hostId: record.hostId, update };
    });

    return publication && this.publish(publication);
  }

  private publish(publication: Publication): Promise<void> {
    this.publications = this.publishAfter(this.publications, publication);

    return this.publications;
  }

  private async publishAfter(previous: Promise<void>, publication: Publication): Promise<void> {
    try {
      await previous;
    } catch {
      // A fresh subscription snapshot recovers an earlier failed publication.
    }

    await this.options
      .hostNamespace()
      .getByName(publication.hostId)
      .sessionUpdate(publication.update);
  }
}
