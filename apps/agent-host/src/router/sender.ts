import type { Channel } from "../shared/lookups";

/**
 * A sender that pushes updates to a router. The host sends the root channel. A session sends
 * its session and chat channels.
 */
export type Sender =
  | { senderType: "host"; sessionId: null }
  | { senderType: "session"; sessionId: string };

/** A channel and the sender that pushes its updates. */
export type ChannelSender = { channel: string; sender: Sender };

/** The channels of each sender. */
export type SenderChannels = { sender: Sender; channels: string[] }[];

export const HOST_SENDER: Sender = { senderType: "host", sessionId: null };

/** The storage key of the host. Session keys are session IDs, which are UUIDs. */
const HOST_KEY = "host";

export function sessionSender(sessionId: string): Sender {
  return { senderType: "session", sessionId };
}

/** Returns the host for the root channel, or the session for a session or chat channel. */
export function channelSender(channel: Channel): Sender {
  return channel.kind === "root" ? HOST_SENDER : sessionSender(channel.sessionId);
}

/** Returns the key that identifies a sender in router storage. */
export function senderKey(sender: Sender): string {
  return sender.senderType === "host" ? HOST_KEY : sender.sessionId;
}

/** Returns the sender of a storage key. */
export function senderFromKey(key: string): Sender {
  return key === HOST_KEY ? HOST_SENDER : sessionSender(key);
}

export function isSameSender(a: Sender, b: Sender): boolean {
  return senderKey(a) === senderKey(b);
}

/** Groups channels by sender. Removes duplicate channels. */
export function groupBySender(entries: ChannelSender[]): SenderChannels {
  const groups: Map<string, { sender: Sender; channels: Set<string> }> = new Map();

  for (const { sender, channel } of entries) {
    const key = senderKey(sender);
    const group = groups.get(key) ?? { sender, channels: new Set<string>() };
    group.channels.add(channel);
    groups.set(key, group);
  }

  return [...groups.values()].map(({ sender, channels }) => ({ sender, channels: [...channels] }));
}
