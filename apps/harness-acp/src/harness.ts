import type { PromptResponse, SessionUpdate } from "@agentclientprotocol/sdk";
import type { AcpModel, SessionModel } from "./model-option";

export type SessionWatch = {
  replay(operationId: string): SessionUpdate[];
  start(): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
};

export type HarnessSession = {
  id: string;
  currentModel(): Promise<SessionModel | undefined>;
  setModel(model: Pick<AcpModel, "provider" | "id">): Promise<void>;
  busy(): Promise<boolean>;
  known(operationId: string): Promise<boolean>;
  prompt(text: string, operationId: string): Promise<PromptResponse>;
  wait(operationId: string): Promise<PromptResponse>;
  abort(): Promise<void>;
  history(): Promise<SessionUpdate[]>;
  watch(send: (update: SessionUpdate) => Promise<void>, signal: AbortSignal): Promise<SessionWatch>;
};

export type AcpHarness = {
  create(): Promise<HarnessSession>;
  list(): Promise<readonly { id: string }[]>;
  session(id: string): HarnessSession;
};
