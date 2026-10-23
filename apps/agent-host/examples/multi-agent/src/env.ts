import type { AgentHostRoot, AgentHostSession, AgentHostConnectionRouter } from "./durable-objects";

export type MultiAgentEnv = {
  AI: Ai;
  LOADER: WorkerLoader;
  WORKSPACE_DIR: string;
  AGENT_HOST: DurableObjectNamespace<AgentHostRoot>;
  AGENT_SESSION: DurableObjectNamespace<AgentHostSession>;
  AGENT_ROUTER: DurableObjectNamespace<AgentHostConnectionRouter>;
};
