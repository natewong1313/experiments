import type { Stream } from "@agentclientprotocol/sdk";
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
import {
  ChatTurnStartedActionSchema,
  ChatTurnCancelledActionSchema,
} from "@experiments/protocol-schemas/ahp";
import { errorMessage } from "../../protocol";
import { SessionDisposeError } from "../../shared/rpc/session";
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
import { SessionAgent } from "./agent";
import type { AgentTextUpdate } from "./agent";

type SessionOptions = {
  db: SessionDatabase;
  workingDirectory(): string;
  hostNamespace(): DurableObjectNamespace<HostRPC>;
  connectAgent(sessionId: string): Promise<Stream>;
  schedule(promise: Promise<void>): void;
};

export class SessionService {
  private disposed = false;
  private promptRunning = false;
  private readonly agent: SessionAgent;
  private publications = Promise.resolve();

  private readonly options: SessionOptions;

  constructor(options: SessionOptions) {
    this.options = options;
    this.agent = new SessionAgent({
      repository: options.db.session,
      getSession: (): Promise<SessionRecord> => this.getSession(),
      isDisposed: (): boolean => this.disposed,
      workingDirectory: (): string => options.workingDirectory(),
      connectAgent: (id): Promise<Stream> => options.connectAgent(id),
      update: (notification): Promise<void> => this.update(notification),
    });
  }

  async recover(): Promise<void> {
    const record = await this.options.db.session.get();

    if (record?.chatState.activeTurn) {
      const publication = applyChat(record, {
        type: AHPActionType.ChatError,
        turnId: record.chatState.activeTurn.id,
        duration: 0,
        part: {
          kind: AHPResponsePartKind.Error,
          error: { errorType: "agent", message: "Turn interrupted by session restart" },
        },
      });

      await this.options.db.session.save(record);
      this.options.schedule(this.publish(publication));
    }
  }

  async create(options: SessionCreateRequest): Promise<void> {
    if (options.workingDirectory !== undefined && !options.workingDirectory.startsWith("/")) {
      throw new Error("Working directory must be an absolute path");
    }

    await this.options.db.transaction(async () => {
      if (await this.options.db.session.get()) {
        throw new Error("Session already exists");
      }

      this.disposed = false;
      const cwd = options.workingDirectory ?? this.options.workingDirectory();
      const record = buildSession(options, cwd);
      await this.options.db.session.create(record);
    });

    try {
      await this.agent.connect();
      const current = await this.getSession();
      const publication = applySession(current, { type: AHPActionType.SessionReady });
      await this.options.db.session.save(current);
      await this.publish(publication);
    } catch (error) {
      try {
        const current = await this.options.db.session.get();

        if (current) {
          const failure = { errorType: "agent", message: errorMessage(error) };

          const publication = applySession(current, {
            type: AHPActionType.SessionCreationFailed,
            error: failure,
          });

          await this.options.db.session.save(current);
          await this.publish(publication);
        }
      } finally {
        this.agent.close();
        await this.options.db.session.remove(options.sessionId);
      }

      throw error;
    }
  }

  async snapshot(req: SessionSnapshotRequest): Promise<SessionSnapshotResponse> {
    const record = await this.getSession();
    const sessionChannel = sessionUri(record.id);
    const chatChannel = record.sessionState.defaultChat;

    if (req.channel !== sessionChannel && req.channel !== chatChannel) {
      throw new Error("Channel does not belong to this session");
    }

    return {
      revision: record.revision,
      state: req.channel === sessionChannel ? record.sessionState : record.chatState,
    };
  }

  async dispatch(options: SessionDispatchRequest): Promise<void> {
    const record = await this.getSession();

    if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
      throw new Error("Session is not ready");
    }

    if (options.action.type === "chat/turnStarted") {
      const parsed = ChatTurnStartedActionSchema.parse(options.action);

      const action: AHPChatTurnStartedAction = {
        type: AHPActionType.ChatTurnStarted,
        turnId: parsed.turnId,
        startedAt: parsed.startedAt,
        message: { text: parsed.message.text, origin: { kind: AHPMessageKind.User } },
      };

      if (record.chatState.activeTurn || this.promptRunning) {
        throw new Error("A turn is already running");
      }

      if (
        parsed.message.origin.kind !== "user" ||
        (parsed.message.attachments?.length ?? 0) > 0 ||
        parsed.message.model ||
        parsed.message.agent
      ) {
        throw new Error("Only user text messages are supported");
      }

      if (record.chatState.turns.some((turn) => turn.id === action.turnId)) {
        throw new Error("Turn ID already exists");
      }

      const publication = applyChat(record, action, options.origin);
      this.promptRunning = true;

      try {
        await this.options.db.session.save(record);
      } catch (error) {
        this.promptRunning = false;
        throw error;
      }

      this.options.schedule(this.runPrompt(action, publication));

      return;
    }

    const parsed = ChatTurnCancelledActionSchema.parse(options.action);

    if (record.chatState.activeTurn?.id !== parsed.turnId) {
      throw new Error("No matching active turn to cancel");
    }

    await this.emit({ ...parsed, type: AHPActionType.ChatTurnCancelled }, options.origin);
    await this.agent.cancel(record.acpSessionId ?? "");
  }

  async dispose(): Promise<void> {
    this.disposed = true;

    const record = await this.options.db.session.get().catch((error) => {
      throw new SessionDisposeError(errorMessage(error));
    });

    try {
      if (record && record.acpSessionId !== null) {
        await this.agent.cancelForDisposal(record.acpSessionId);
      }
    } finally {
      this.agent.close();

      if (record) {
        await this.options.db.session.remove(record.id);
      }
    }
  }

  private async getSession(): Promise<SessionRecord> {
    const record = await this.options.db.session.get();

    if (!record || this.disposed) {
      throw new Error("Session does not exist");
    }

    return record;
  }

  private async runPrompt(
    action: AHPChatTurnStartedAction,
    publication: HostSessionUpdateRequest,
  ): Promise<void> {
    const started = Date.now();

    try {
      await this.publish(publication);

      const response = await this.agent.prompt({
        turnId: action.turnId,
        text: action.message.text,
        startResponse: () =>
          this.emit({
            type: AHPActionType.ChatResponsePart,
            turnId: action.turnId,
            part: { kind: AHPResponsePartKind.Markdown, id: action.turnId, content: "" },
          }),
      });

      if (!response) {
        return;
      }

      const current = await this.options.db.session.get();

      if (current?.chatState.activeTurn?.id === action.turnId) {
        await this.emit({
          type:
            response.stopReason === "cancelled"
              ? AHPActionType.ChatTurnCancelled
              : AHPActionType.ChatTurnComplete,
          turnId: action.turnId,
          duration: Date.now() - started,
        });
      }
    } catch (error) {
      const current = await this.options.db.session.get();

      if (current?.chatState.activeTurn?.id === action.turnId) {
        await this.emit({
          type: AHPActionType.ChatError,
          turnId: action.turnId,
          duration: Date.now() - started,
          part: {
            kind: AHPResponsePartKind.Error,
            error: { errorType: "agent", message: errorMessage(error) },
          },
        });
      }
    } finally {
      this.promptRunning = false;
    }
  }

  private async update(notification: AgentTextUpdate): Promise<void> {
    if (this.disposed) {
      return;
    }

    const record = await this.options.db.session.get();
    const turn = record?.chatState.activeTurn;

    if (turn && notification.sessionId === record.acpSessionId) {
      await this.emit({
        type: AHPActionType.ChatDelta,
        turnId: turn.id,
        partId: turn.id,
        content: notification.text,
      });
    }
  }

  private async emit(action: AHPChatAction, origin?: AHPActionOrigin): Promise<void> {
    const record = await this.getSession();
    const publication = applyChat(record, action, origin);
    await this.options.db.session.save(record);
    await this.publish(publication);
  }

  private publish(publication: HostSessionUpdateRequest): Promise<void> {
    const previous = this.publications;
    this.publications = this.publishAfter(previous, publication);

    return this.publications;
  }

  private async publishAfter(
    previous: Promise<void>,
    publication: HostSessionUpdateRequest,
  ): Promise<void> {
    try {
      await previous;
    } catch {
      // A fresh subscription snapshot recovers an earlier failed publication.
    }

    const record = await this.options.db.session.get();

    if (record && !this.disposed) {
      await this.options.hostNamespace().getByName(record.hostId).sessionUpdate(publication);
    }
  }
}
