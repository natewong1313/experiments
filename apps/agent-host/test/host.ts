import { AgentHostRoot as BaseHost } from "../src";
import type {
  HostRemovedResponse,
  HostSessionEntry,
  HostSessionRemovedRequest,
} from "../src/shared/rpc/host";
import type { AgentInfo as AHPAgentInfo } from "@microsoft/agent-host-protocol";
import type { AgentHostConnectionRouter } from "./router";
import type { TestEnv } from "./worker";

export const TEST_AGENT: AHPAgentInfo = {
  provider: "test",
  displayName: "Test",
  description: "In-process ACP agent",
  models: [],
};

export class AgentHost extends BaseHost<TestEnv, AgentHostConnectionRouter> {
  private removalsFail = false;
  private createGate?: ReturnType<typeof Promise.withResolvers<null>>;

  router = this.env.CONNECTIONS;

  async sessionCreated(req: HostSessionEntry): Promise<void> {
    await this.createGate?.promise;
    await super.sessionCreated(req);
  }

  /** Makes each `sessionCreated` call wait until `releaseCreates`. */
  holdCreates(): void {
    this.createGate = Promise.withResolvers<null>();
  }

  releaseCreates(): void {
    this.createGate?.resolve(null);
    this.createGate = undefined;
  }

  async sessionRemoved(req: HostSessionRemovedRequest): Promise<HostRemovedResponse> {
    if (this.removalsFail) {
      throw new Error("Host is not available");
    }

    return await super.sessionRemoved(req);
  }

  /** Makes each `sessionRemoved` call fail until `failRemovals(false)`. */
  failRemovals(fail: boolean): void {
    this.removalsFail = fail;
  }

  protected getAgentInfo(): AHPAgentInfo {
    return TEST_AGENT;
  }
}
