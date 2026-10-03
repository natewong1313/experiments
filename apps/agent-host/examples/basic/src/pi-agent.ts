import { PiAgent as BasePiAgent } from "@experiments/pi-agent";

export class PiAgent extends BasePiAgent<Env> {
  protected override getWorkspaceDirectory(): string {
    return this.env.WORKSPACE_DIR;
  }
}
