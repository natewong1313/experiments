import { DurableObject } from "cloudflare:workers";
import { methods } from "@agentclientprotocol/sdk";
import type {
  ClientConnection as ACPClientConnection,
  SessionNotification as ACPSessionNotification,
  Stream as ACPStream,
} from "@agentclientprotocol/sdk";
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
import { openAgent } from "../agent/connection";
import { textUpdate } from "../agent/updates";
import { errorMessage, sessionUri } from "../protocol";
import type { CreateSessionOptions, SessionPublication, SessionSnapshot } from "../types";
import type { AgentHost } from "../host/durable-object";
import { SessionDatabase } from "./db/database";
import type { SessionRecord } from "./db/schema";
import { applyChat, applySession, initialRecord } from "./state";

type DispatchOptions = { action: { type: string }; origin: AHPActionOrigin };

type AgentSessionDOState = {
  loading: boolean;
  disposed: boolean;
  promptRunning: boolean;
};

export abstract class AgentSession<Env = unknown> extends DurableObject<Env> {
  protected readonly db = new SessionDatabase(this.ctx.storage);
  private connection?: ACPClientConnection;
  private connecting?: Promise<ACPClientConnection>;
  private publications = Promise.resolve();
  private state: AgentSessionDOState = {
    loading: false,
    disposed: false,
    promptRunning: false,
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      await this.db.migrate();
      const record = this.db.session.get();

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

        this.db.session.save(record);
        this.ctx.waitUntil(this.publish(publication));
      }
    });
  }

  protected abstract getHostNamespace(): DurableObjectNamespace<AgentHost<Env>>;
  protected abstract connectAgent(sessionId: string): Promise<ACPStream>;

  protected getWorkingDirectory(): string {
    return "/";
  }

  async create(options: CreateSessionOptions): Promise<string | null> {
    if (this.db.session.get()) {
      throw new Error("Session already exists");
    }

    this.state.disposed = false;
    const cwd = options.workingDirectory ?? this.getWorkingDirectory();
    const record = initialRecord(options, cwd);
    this.db.session.create(record);

    try {
      await this.getConnection();
      const current = this.requireRecord();
      const publication = applySession(current, { type: AHPActionType.SessionReady });
      this.db.session.save(current);
      await this.publish(publication);

      return null;
    } catch (error) {
      try {
        const current = this.db.session.get();

        if (current) {
          const failure = { errorType: "agent", message: errorMessage(error) };

          const publication = applySession(current, {
            type: AHPActionType.SessionCreationFailed,
            error: failure,
          });

          this.db.session.save(current);
          await this.publish(publication);
        }
      } finally {
        this.connection?.close();
        this.db.session.remove(options.sessionId);
      }

      return errorMessage(error);
    }
  }

  snapshot(channel: string): string {
    const record = this.requireRecord();

    const snapshot: SessionSnapshot = {
      revision: record.revision,
      state: channel === sessionUri(record.id) ? record.sessionState : record.chatState,
    };

    return JSON.stringify(snapshot);
  }

  async dispatch(options: DispatchOptions): Promise<string | null> {
    const record = this.requireRecord();

    if (record.sessionState.lifecycle !== AHPSessionLifecycle.Ready) {
      return "Session is not ready";
    }

    if (options.action.type === "chat/turnStarted") {
      const parsed = ChatTurnStartedActionSchema.parse(options.action);

      const action: AHPChatTurnStartedAction = {
        type: AHPActionType.ChatTurnStarted,
        turnId: parsed.turnId,
        startedAt: parsed.startedAt,
        message: { text: parsed.message.text, origin: { kind: AHPMessageKind.User } },
      };

      if (record.chatState.activeTurn || this.state.promptRunning) {
        return "A turn is already running";
      }

      if (
        parsed.message.origin.kind !== "user" ||
        (parsed.message.attachments?.length ?? 0) > 0 ||
        parsed.message.model ||
        parsed.message.agent
      ) {
        return "Only user text messages are supported";
      }

      if (record.chatState.turns.some((turn) => turn.id === action.turnId)) {
        return "Turn ID already exists";
      }

      const publication = applyChat(record, action, options.origin);
      this.db.session.save(record);
      this.state.promptRunning = true;
      this.ctx.waitUntil(this.runPrompt(action, publication));

      return null;
    }

    if (options.action.type === "chat/turnCancelled") {
      const parsed = ChatTurnCancelledActionSchema.parse(options.action);

      if (record.chatState.activeTurn?.id !== parsed.turnId) {
        return "No matching active turn to cancel";
      }

      await this.emit({ ...parsed, type: AHPActionType.ChatTurnCancelled }, options.origin);
      await this.connection?.agent.notify(methods.agent.session.cancel, {
        sessionId: record.acpSessionId ?? "",
      });

      return null;
    }

    return "Action is not supported";
  }

  async dispose(): Promise<void> {
    this.state.disposed = true;
    const record = this.db.session.get();

    try {
      if (
        record &&
        record.acpSessionId !== null &&
        this.connection &&
        !this.connection.signal.aborted
      ) {
        await this.connection.agent.notify(methods.agent.session.cancel, {
          sessionId: record.acpSessionId,
        });
      }
    } finally {
      this.connection?.close();

      if (record) {
        this.db.session.remove(record.id);
      }
    }
  }

  private requireRecord(): SessionRecord {
    const record = this.db.session.get();

    if (!record || this.state.disposed) {
      throw new Error("Session does not exist");
    }

    return record;
  }

  private async getConnection(): Promise<ACPClientConnection> {
    if (this.connection && !this.connection.signal.aborted) {
      return this.connection;
    }

    if (this.connecting) {
      return await this.connecting;
    }

    this.connecting = this.openConnection();

    try {
      return await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async openConnection(): Promise<ACPClientConnection> {
    const record = this.requireRecord();
    const directory = record.sessionState.workingDirectories?.[0];

    const cwd =
      directory === undefined
        ? this.getWorkingDirectory()
        : decodeURIComponent(new URL(directory).pathname);

    this.state.loading = true;

    try {
      const stream = await this.connectAgent(record.id);

      const opened = await openAgent({
        stream,
        cwd,
        sessionId: record.acpSessionId,
        update: (notification) => this.update(notification),
      });

      if (this.state.disposed) {
        opened.connection.close();
        throw new Error("Session was disposed during agent initialization");
      }

      const current = this.requireRecord();
      current.acpSessionId = opened.sessionId;
      this.db.session.save(current);
      this.connection = opened.connection;

      return opened.connection;
    } finally {
      this.state.loading = false;
    }
  }

  private async runPrompt(
    action: AHPChatTurnStartedAction,
    publication: SessionPublication,
  ): Promise<void> {
    const started = Date.now();

    try {
      await this.publish(publication);
      const connection = await this.getConnection();
      const record = this.requireRecord();

      if (record.chatState.activeTurn?.id !== action.turnId || record.acpSessionId === null) {
        return;
      }

      await this.emit({
        type: AHPActionType.ChatResponsePart,
        turnId: action.turnId,
        part: { kind: AHPResponsePartKind.Markdown, id: action.turnId, content: "" },
      });

      const response = await connection.agent.request(methods.agent.session.prompt, {
        sessionId: record.acpSessionId,
        prompt: [{ type: "text", text: action.message.text }],
      });

      if (this.db.session.get()?.chatState.activeTurn?.id === action.turnId) {
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
      if (this.db.session.get()?.chatState.activeTurn?.id === action.turnId) {
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
      this.state.promptRunning = false;
    }
  }

  private async update(notification: ACPSessionNotification): Promise<void> {
    if (this.state.loading || this.state.disposed) {
      return;
    }

    const record = this.db.session.get();
    const turn = record?.chatState.activeTurn;
    const text = textUpdate(notification);

    if (turn && text !== undefined && notification.sessionId === record.acpSessionId) {
      await this.emit({
        type: AHPActionType.ChatDelta,
        turnId: turn.id,
        partId: turn.id,
        content: text,
      });
    }
  }

  private async emit(action: AHPChatAction, origin?: AHPActionOrigin): Promise<void> {
    const record = this.requireRecord();
    const publication = applyChat(record, action, origin);
    this.db.session.save(record);
    await this.publish(publication);
  }

  private publish(publication: SessionPublication): Promise<void> {
    const previous = this.publications;
    this.publications = this.publishAfter(previous, publication);

    return this.publications;
  }

  private async publishAfter(
    previous: Promise<void>,
    publication: SessionPublication,
  ): Promise<void> {
    try {
      await previous;
    } catch {
      // A fresh subscription snapshot recovers an earlier failed publication.
    }

    const record = this.db.session.get();

    if (record && !this.state.disposed) {
      await this.getHostNamespace().getByName(record.hostId).publish(JSON.stringify(publication));
    }
  }
}
