import * as z from "zod";
import { AHPError, ROOT_CHANNEL } from "./protocol";

const SESSION_PREFIX = "ahp-session:/";
const CHAT_PREFIX = "ahp-chat:/";
const UUIDSchema = z.uuid();

export type SessionChannel = { kind: "session"; sessionId: string };

export type ChatChannel = { kind: "chat"; sessionId: string; chatId: string };

export type Channel = { kind: "root" } | SessionChannel | ChatChannel;

/** The sender ID of root channel pushes. A session uses its session UUID as its sender ID. */
export const ROOT_SENDER = "root";

export function sessionUri(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}`;
}

/** Chat URIs contain the session ID, so a router can find the session without a lookup. */
export function chatUri(sessionId: string, chatId: string): string {
  return `${CHAT_PREFIX}${sessionId}/${chatId}`;
}

export function sessionDOName(hostId: string, sessionId: string): string {
  return `${hostId}/${sessionId}`;
}

/** Returns the session ID from a session Durable Object name. */
export function sessionIdFromDOName(name: string): string {
  const [, sessionId] = name.split("/");

  if (sessionId === undefined) {
    throw new Error("Session name must end with a session UUID");
  }

  return sessionId;
}

/** Returns a new router name. Each WebSocket connection has its own router. */
export function newRouterDOName(hostId: string): string {
  return `${hostId}/${crypto.randomUUID()}`;
}

/** Returns the host ID from a router name. */
export function hostIdFromRouterName(routerName: string): string {
  const [hostId] = routerName.split("/");

  if (hostId === undefined || !UUIDSchema.safeParse(hostId).success) {
    throw new Error("Router name must start with a host UUID");
  }

  return hostId;
}

/**
 * Returns the name that a Durable Object was addressed with. The agent host classes derive
 * the names of their peers from it.
 *
 * @throws {Error} If the object was created with `newUniqueId()`.
 */
export function requireName(ctx: DurableObjectState, className: string): string {
  if (ctx.id.name === undefined) {
    throw new Error(`${className} must be addressed by name`);
  }

  return ctx.id.name;
}

/** Returns `ROOT_SENDER` for the root channel, or the session ID for other channels. */
export function channelSender(channel: Channel): string {
  return channel.kind === "root" ? ROOT_SENDER : channel.sessionId;
}

/**
 * Parses an AHP channel URI.
 *
 * @throws {AHPError} If the channel is not a root, session, or chat channel of this host.
 */
export function parseChannel(uri: string): Channel {
  if (uri === ROOT_CHANNEL) {
    return { kind: "root" };
  }

  if (uri.startsWith(SESSION_PREFIX)) {
    return { kind: "session", sessionId: channelId(uri.slice(SESSION_PREFIX.length)) };
  }

  if (uri.startsWith(CHAT_PREFIX)) {
    const [sessionId = "", chatId = "", ...rest] = uri.slice(CHAT_PREFIX.length).split("/");

    if (rest.length > 0) {
      throw new AHPError("Unsupported channel");
    }

    return { kind: "chat", sessionId: channelId(sessionId), chatId: channelId(chatId) };
  }

  throw new AHPError("Unsupported channel");
}

// Channel IDs must match stored IDs exactly. Thus this function accepts only lowercase UUIDs.
function channelId(id: string): string {
  if (id !== id.toLowerCase() || !UUIDSchema.safeParse(id).success) {
    throw new AHPError("Channel ID must be a lowercase UUID");
  }

  return id;
}
