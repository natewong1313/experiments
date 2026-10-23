import { modelValue } from "@experiments/harness-acp";
import type { AcpModel } from "@experiments/harness-acp";
import type { AgentInfo } from "../../src";
import type { AgentHostConnectionRouter } from "./router";
import type { AgentHostRoot } from "./root";
import type { AgentHostSession } from "./session";

/** The example environment, with the namespaces of the classes of this worker. */
export type IntegrationEnv = Omit<Env, "AGENT_HOST" | "AGENT_SESSION" | "AGENT_ROUTER"> & {
  AGENT_HOST: DurableObjectNamespace<AgentHostRoot>;
  AGENT_SESSION: DurableObjectNamespace<AgentHostSession>;
  AGENT_ROUTER: DurableObjectNamespace<AgentHostConnectionRouter>;
};

/** The Faux models that the agent offers. The first one is the default of a new session. */
export const FAUX_MODELS: readonly AcpModel[] = [
  { provider: "faux", id: "test" },
  { provider: "faux", id: "other" },
];

/** Agent info that lists the Faux models by their ACP `model` config values. */
export const AGENT_INFO: AgentInfo = {
  provider: "pi",
  displayName: "Pi",
  description: "Pi coding agent",
  models: FAUX_MODELS.map((model) => ({
    id: modelValue(model.provider, model.id),
    provider: model.provider,
    name: model.id,
  })),
};
