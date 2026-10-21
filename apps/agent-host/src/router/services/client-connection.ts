import { errorMessage } from "../../shared/errors";
import type { AgentHostConnectionRouterDeps } from "../dependencies";
import { CloseCode } from "../websockets";
import type { Subscriptions } from "./subscriptions";

/**
 * The lifecycle of the client connection. `new` means that the router has no connection and no
 * storage. A router does not open a connection again after `closed`. Each open connection is a
 * new object. A frame's connection is still open when its object matches the current state.
 */
type ConnectionState = { kind: "new" } | { kind: "open" } | { kind: "closed" };

type OpenConnection = Extract<ConnectionState, { kind: "open" }>;

/**
 * One client frame. `isCurrent` returns false after the connection that the frame started
 * under closes. Work for a frame of a closed connection must not write router storage.
 */
export type Frame = { isCurrent(): boolean };

/** Handles one client frame. */
export type FrameHandler = (frame: Frame) => Promise<void>;

/**
 * Owns the lifecycle of the client WebSocket. The router has at most one connection.
 *
 * The connection admits client frames one at a time. `close` ends the connection before it
 * awaits anything. Work that started under the closed connection sees `isCurrent` return false
 * and must not write router storage. The router deletes its storage later, after the senders
 * stop their pushes.
 */
export class ClientConnection {
  private deps: AgentHostConnectionRouterDeps;
  private subscriptions: Subscriptions;
  private state: ConnectionState = { kind: "new" };
  // The last frame that the socket sent. Each frame waits for the frame before it.
  private lastFrame: Promise<void> = Promise.resolve();

  constructor(deps: AgentHostConnectionRouterDeps, subscriptions: Subscriptions) {
    this.deps = deps;
    this.subscriptions = subscriptions;
  }

  /** True while the client connection is open. */
  isOpen(): boolean {
    return this.state.kind === "open";
  }

  /** True if the router can accept a connection. A router has at most one connection. */
  canOpen(): boolean {
    return this.state.kind === "new" && this.deps.ctx.getWebSockets().length === 0;
  }

  /**
   * Resumes the connection after a restart if the router has storage. Storage exists from the
   * open of the connection until the cleanup after its close.
   */
  async restore(): Promise<void> {
    const { ctx, db, durability } = this.deps;

    if (!db.hasMigrated()) {
      return;
    }

    // Storage from an earlier version can need newer migrations.
    await db.migrate();
    durability.open();

    // The connection closed before the restart. The cleanup deletes the storage.
    if (await durability.closeStarted()) {
      this.state = { kind: "closed" };

      return;
    }

    this.state = { kind: "open" };

    // The router acknowledged the held pushes of the interrupted setup, but lost them.
    if (this.deps.subscriptionStore.interrupted()) {
      for (const socket of ctx.getWebSockets()) {
        socket.close(CloseCode.InternalError, "Subscription setup interrupted");
      }

      await this.close();
    }
  }

  /**
   * Opens the connection. Creates the router storage, accepts the server side of a new
   * WebSocket, and returns the client side. The caller checks `canOpen` first.
   */
  async open(): Promise<WebSocket> {
    await this.deps.db.migrate();
    this.deps.durability.open();
    this.state = { kind: "open" };

    const { 0: client, 1: server } = new WebSocketPair();
    this.deps.ctx.acceptWebSocket(server);
    server.serializeAttachment({});

    return client;
  }

  /**
   * Ends the connection and registers a durable call that tells each sender to stop its pushes.
   * Resolves after the registration. The router deletes its storage after the call settles.
   */
  async close(): Promise<void> {
    if (this.state.kind !== "open") {
      return;
    }

    const senders = this.subscriptions.release();
    this.state = { kind: "closed" };
    await this.deps.durability.registerClose(senders);
  }

  /** Closes the socket with a close code, then ends the connection. */
  async closeSocket(socket: WebSocket, code: number, reason: string): Promise<void> {
    socket.close(code, reason);
    await this.close();
  }

  /**
   * Closes the socket with code 1011, then ends the connection. The client must initialize
   * again to get new snapshots.
   */
  async fail(reason: string): Promise<void> {
    const socket = await this.socket();

    if (socket) {
      await this.closeSocket(socket, CloseCode.InternalError, reason);
    }
  }

  /**
   * Returns the socket of the open connection, or undefined if the connection is not open. An
   * open connection without a socket closes.
   */
  async socket(): Promise<WebSocket | undefined> {
    if (!this.isOpen()) {
      return;
    }

    const [socket] = this.deps.ctx.getWebSockets();

    if (!socket) {
      await this.close();
    }

    return socket;
  }

  /**
   * Runs a client frame after all earlier frames. Ignores frames after a disconnect.
   * Held pushes reach the client after `handle` sends its reply, also if `handle` throws.
   */
  async receiveFrame(socket: WebSocket, handle: FrameHandler): Promise<void> {
    const { state } = this;

    if (state.kind !== "open") {
      return;
    }

    const frame = this.runFrame(state, this.lastFrame, socket, handle);
    this.lastFrame = frame;
    await frame;
  }

  /** Waits for the frame before it, then handles the frame if its connection is still open. */
  private async runFrame(
    connection: OpenConnection,
    previous: Promise<void>,
    socket: WebSocket,
    handle: FrameHandler,
  ): Promise<void> {
    await Promise.allSettled([previous]);

    if (this.state !== connection) {
      return;
    }

    // The frame is current until its connection closes.
    const frame = { isCurrent: (): boolean => this.state === connection };

    try {
      await handle(frame);
    } finally {
      try {
        await this.subscriptions.finishFrame();
      } catch (error) {
        console.error("Held router push failed", { error: errorMessage(error) });
        await this.closeSocket(socket, CloseCode.InternalError, "Connection error");
      }
    }
  }
}
