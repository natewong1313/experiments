import type { AgentConfig } from "../src/index";
import { workingDirectory } from "../src/host-config";
import type { HostStore, Publication } from "../src/state/store";

const TEST_CONFIG: AgentConfig = {
  agent: {
    provider: "pi",
    displayName: "Pi",
    description: "Pi through the harness container",
    models: [],
  },
  cwd: "/workspace",
};

function createSession(
  store: HostStore,
  uri: string,
  sessionKey: string,
): Publication {
  return store.create({
    uri,
    sessionKey,
    provider: TEST_CONFIG.agent.provider,
    workingDirectory: workingDirectory(TEST_CONFIG.cwd),
  });
}

export { TEST_CONFIG, createSession };
