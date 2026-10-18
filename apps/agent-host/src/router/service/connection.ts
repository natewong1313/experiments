import type { RouterChannels } from "./channels";
import { SenderGate } from "./gate";
import type { Senders } from "./senders";

/**
 * The scope of one client frame. Subscription handling holds the pushes of a sender until the
 * frame sends its reply.
 */
export type FrameScope = {
  /** Holds pushes from the senders until the frame ends. */
  hold(senders: string[]): void;

  /** Returns false after the connection of the frame closes. */
  isCurrent(): boolean;
};

/** Handles one client frame inside its scope. */
export type FrameHandler = (
  socket: WebSocket,
  raw: string | ArrayBuffer,
  frame: FrameScope,
) => Promise<void>;

type RouterConnectionOptions = {
  channels: RouterChannels;
  senders: Senders;
  handleFrame: FrameHandler;
};

/** The identity of one open connection. A closed connection never opens again. */
type Connection = { readonly id: string };

/**
 * Owns the lifecycle of the client connection of a router. It admits client frames one at a
 * time, holds pushes behind subscribing frames, and removes the subscriptions when the
 * connection closes.
 *
 * `close` ends the connection before it awaits anything. Work that started under the closed
 * connection sees `isCurrent()` return false and must not write router storage.
 */
export class RouterConnection {
  private options: RouterConnectionOptions;
  private channels: RouterChannels;
  private gate = new SenderGate();
  private connection?: Connection;
  // The last frame that the socket sent. Each frame waits for the frame before it.
  private frames: Promise<void> = Promise.resolve();
  // The cleanup of the last closed connection.
  private closing: Promise<void> = Promise.resolve();

  constructor(options: RouterConnectionOptions) {
    this.options = options;
    this.channels = options.channels;
  }

  /** Resumes the connection after a restart if the router has storage. */
  async load(): Promise<void> {
    if (this.channels.exists()) {
      await this.channels.open();
      this.connection = { id: crypto.randomUUID() };
    }
  }

  /** Creates the storage for a new connection after the cleanup of an earlier connection. */
  async open(): Promise<void> {
    await this.closing;
    await this.channels.open();
    this.connection = { id: crypto.randomUUID() };
  }

  isOpen(): boolean {
    return this.connection !== undefined;
  }

  /** Runs a client frame after all earlier frames. Ignores frames after a close. */
  async handleMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const { connection } = this;

    if (connection === undefined) {
      return;
    }

    const frame = this.runFrame(connection, this.frames, socket, raw);
    this.frames = frame;
    await frame;
  }

  /** Resolves when pushes from the sender may continue. Returns false if the connection closed. */
  async admitPush(sender: string): Promise<boolean> {
    await this.gate.settled(sender);

    return this.isOpen();
  }

  /**
   * Ends the connection, deletes the router storage, and tells each sender to stop its pushes.
   * The unsubscribe calls are best effort. A sender also stops after a push to this router
   * reports no subscriptions.
   */
  async close(): Promise<void> {
    if (this.connection === undefined) {
      return;
    }

    this.connection = undefined;
    const senders = this.channels.senders();
    this.closing = this.cleanUp(senders);
    await this.closing;
  }

  private async runFrame(
    connection: Connection,
    previous: Promise<void>,
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    await Promise.allSettled([previous]);

    if (this.connection !== connection) {
      return;
    }

    const releases: Map<string, () => void> = new Map();

    const frame: FrameScope = {
      hold: (senders): void => {
        for (const sender of senders) {
          if (!releases.has(sender)) {
            releases.set(sender, this.gate.hold(sender));
          }
        }
      },
      isCurrent: (): boolean => this.connection === connection,
    };

    try {
      await this.options.handleFrame(socket, raw, frame);
    } finally {
      for (const release of releases.values()) {
        release();
      }
    }
  }

  private async cleanUp(senders: Map<string, string[]>): Promise<void> {
    await this.channels.clear();

    await Promise.allSettled(
      [...senders].map(async ([sender, channels]) => {
        await this.options.senders.unsubscribe(sender, channels);
      }),
    );
  }
}
