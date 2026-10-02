import type { HarnessContainerEnv } from "@experiments/harness-container";
import { HarnessContainer as BaseHarnessContainer } from "@experiments/harness-container";

type ContainerEnvironment = HarnessContainerEnv & { WORKSPACE_DIR: string };

class HarnessContainer extends BaseHarnessContainer<Env> {
  protected override getContainerEnv(): ContainerEnvironment {
    return {
      ...super.getContainerEnv(),
      WORKSPACE_DIR: this.env.WORKSPACE_DIR,
    };
  }
}

export { HarnessContainer };
