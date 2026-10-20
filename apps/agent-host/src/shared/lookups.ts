import * as z from "zod";
import { AHPError, ROOT_CHANNEL } from "./protocol";

const SESSION_PREFIX = "ahp-session:/";
const CHAT_PREFIX = "ahp-chat:/";
const UUIDSchema = z.uuid();

export type SessionChannel = { kind: "session"; sessionId: string };

export type ChatChannel = { kind: "chat"; sessionId: string; chatId: string };

export type Channel = { kind: "root" } | SessionChannel | ChatChannel;

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

/** The host and session that a session Durable Object name identifies. */
export type SessionDOName = { hostId: string; sessionId: string };

/**
 * Parses a session Durable Object name from `sessionDOName`.
 *
 * @throws {Error} If the name is not a host UUID and a session UUID.
 */
export function parseSessionDOName(name: string): SessionDOName {
  const [hostId = "", sessionId = "", ...rest] = name.split("/");

  if (
    !UUIDSchema.safeParse(hostId).success ||
    !UUIDSchema.safeParse(sessionId).success ||
    rest.length > 0
  ) {
    throw new Error("Session name must be a host UUID and a session UUID");
  }

  return { hostId, sessionId };
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
