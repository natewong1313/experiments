import type { TestHarness } from "./pi-worker";

export { TestHarness } from "./pi-worker";

type TestEnv = {
  HARNESS: DurableObjectNamespace<TestHarness>;
};

export type { TestEnv };
