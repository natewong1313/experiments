import * as z from "zod";
import { AHPError, ROOT_CHANNEL } from "./protocol";

const SESSION_PREFIX = "ahp-session:/";
const CHAT_PREFIX = "ahp-chat:/";
const UUIDSchema = z.uuid();

export type SessionChannel = { kind: "session"; id: string };

export type ChatChannel = { kind: "chat"; id: string };

export type Channel = { kind: "root" } | SessionChannel | ChatChannel;

export function sessionUri(id: string): string {
  return `${SESSION_PREFIX}${id}`;
}

export function chatUri(id: string): string {
  return `${CHAT_PREFIX}${id}`;
}

export function sessionDOName(hostId: string, sessionId: string): string {
  return `${hostId}/${sessionId}`;
}

export function parseChannel(uri: string): Channel {
  if (uri === ROOT_CHANNEL) {
    return { kind: "root" };
  }

  if (uri.startsWith(SESSION_PREFIX)) {
    return { kind: "session", id: channelId(uri.slice(SESSION_PREFIX.length)) };
  }

  if (uri.startsWith(CHAT_PREFIX)) {
    return { kind: "chat", id: channelId(uri.slice(CHAT_PREFIX.length)) };
  }

  throw new AHPError("Unsupported channel");
}

// Channel IDs are compared as stored, so only the lowercase canonical UUID form is accepted.
function channelId(id: string): string {
  if (id !== id.toLowerCase() || !UUIDSchema.safeParse(id).success) {
    throw new AHPError("Channel ID must be a lowercase UUID");
  }

  return id;
}
