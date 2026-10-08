import type { DurableObjectStorageLike, Workspace } from "@cloudflare/computer";
import { createPiTools } from "@cloudflare/computer/tools/pi-ai";
import type { ToolRegistration } from "@earendil-works/pi-durable";

export const JAVASCRIPT_BACKEND = "javascript";
const REPLAY_SAFE = new Set(["read", "ls", "find", "grep", "write", "delete"]);

export function workspaceStorage(storage: DurableObjectStorage): DurableObjectStorageLike {
  return {
    sql: {
      exec: <Row extends object>(query: string, ...bindings: SqlStorageValue[]) =>
        storage.sql.exec<Row & Record<string, SqlStorageValue>>(query, ...bindings),
    },
    transactionSync: <T>(closure: () => T): T => storage.transactionSync(closure),
  };
}

export function createWorkspaceTools(workspace: Workspace): ToolRegistration[] {
  const { tools, execute } = createPiTools({
    workspace,
    shell: {
      defaultBackend: JAVASCRIPT_BACKEND,
      backends: {
        [JAVASCRIPT_BACKEND]: {
          description: "Runs ES module source in a sandboxed isolate.",
        },
      },
    },
  });

  return tools.map((tool): ToolRegistration => {
    const registration: ToolRegistration = {
      ...tool,
      description:
        tool.name === "exec"
          ? "Run JavaScript ES module source in a fresh sandboxed isolate. Default-export a function to receive input and return a result. Imports support node:fs/promises for workspace files, ws:git for git operations, and relative workspace .js modules. Git paths resolve against the working directory. There is no shell, npm, package installation, or direct network access. Use read, write and edit for plain file changes."
          : tool.description,
      replay: REPLAY_SAFE.has(tool.name) ? "safe" : "unsafe",
      async execute(args, api, context) {
        return await execute(
          { id: api.callId, name: tool.name, arguments: args },
          { abortSignal: context.abortSignal },
        );
      },
    };

    return tool.name === "exec" ? { ...registration, executionMode: "sequential" } : registration;
  });
}
