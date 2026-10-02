import { HarnessContainer as BaseHarnessContainer } from "@experiments/harness-container";

class HarnessContainer extends BaseHarnessContainer<Env> {
  protected override getContainerEnv(): Record<string, string> {
    return {
      ...super.getContainerEnv(),
      WORKSPACE_DIR: this.env.WORKSPACE_DIR,
    };
  }
}

export { HarnessContainer };
