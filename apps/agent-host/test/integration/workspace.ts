import { Workspace } from "@cloudflare/computer";
import { WorkerJavaScriptBackend } from "@cloudflare/computer/backends/worker-javascript";
import { createGitClient } from "@cloudflare/computer/git";
import type { ToolRegistration } from "@earendil-works/pi-durable";
import {
  createWorkspaceTools,
  JAVASCRIPT_BACKEND,
  workspaceStorage,
} from "../../examples/basic/src/workspace";
import type { IntegrationEnv } from "./agent";

/** Returns the workspace of a session, set up as the example sets it up. */
export function workspaceOf(storage: DurableObjectStorage, env: IntegrationEnv): Workspace {
  return new Workspace({
    storage: workspaceStorage(storage),
    git: createGitClient(),
    backends: [
      new WorkerJavaScriptBackend({
        id: JAVASCRIPT_BACKEND,
        loader: env.LOADER,
        root: env.WORKSPACE_DIR,
        access: "read-write",
        allowGitNetwork: true,
      }),
    ],
  });
}

/** Returns the workspace tools of the example. */
export function workspaceToolsOf(workspace: Workspace): ToolRegistration[] {
  return createWorkspaceTools(workspace);
}
