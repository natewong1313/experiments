import {
  HarnessContainer as BaseHarnessContainer,
  type HarnessContainerEnv,
} from "@experiments/harness-container";

type WorkspaceHarnessContainerEnv = {
  WORKSPACE_DIR: string;
} & HarnessContainerEnv;

class HarnessContainer extends BaseHarnessContainer<Env> {
  protected override getContainerEnv(): WorkspaceHarnessContainerEnv {
    return {
      ...super.getContainerEnv(),
      WORKSPACE_DIR: this.env.WORKSPACE_DIR,
    };
  }
}

export { HarnessContainer };
