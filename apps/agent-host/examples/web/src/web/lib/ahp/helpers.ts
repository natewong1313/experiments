import type { URI } from "@microsoft/agent-host-protocol";

const SESSION_PREFIX = "ahp-session:/";

export function sessionIdOf(uri: URI): string {
  return uri.startsWith(SESSION_PREFIX) ? uri.slice(SESSION_PREFIX.length) : uri;
}
