import type { AgentConfig } from "../src/index";
import { workingDirectory } from "../src/host-config";
import type { HostState, Publication } from "../src/state";

export const TEST_CONFIG: AgentConfig = {
  agent: {
    provider: "pi",
    displayName: "Pi",
    description: "Pi through the harness container",
    models: [],
  },
  cwd: "/workspace",
};

export function createSession(store: HostState, uri: string, sessionKey: string): Publication {
  return store.mutations.createSession({
    uri,
    sessionKey,
    provider: TEST_CONFIG.agent.provider,
    workingDirectory: workingDirectory(TEST_CONFIG.cwd),
  });
}

export { createHostState, type HostState } from "../src/state";
