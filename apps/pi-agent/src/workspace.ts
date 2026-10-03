import type { Workspace } from "@cloudflare/computer";
import { createPiTools } from "@cloudflare/computer/tools/pi-ai";
import type { ToolRegistration } from "@earendil-works/pi-durable";

const JAVASCRIPT_BACKEND = "javascript";

const REPLAY_SAFE = new Set(["read", "ls", "find", "grep", "write", "delete"]);

function workspaceStorage(storage: DurableObjectStorage) {
  return {
    sql: {
      exec: <Row extends object>(
        query: string,
        ...bindings: (SqlStorageValue | Uint8Array)[]
      ) =>
        storage.sql.exec<Row & Record<string, SqlStorageValue>>(
          query,
          ...bindings.map((value) =>
            value instanceof Uint8Array ? new Uint8Array(value).buffer : value,
          ),
        ),
    },
    transactionSync: <T>(closure: () => T) => storage.transactionSync(closure),
  };
}

function createWorkspaceTools(workspace: Workspace): ToolRegistration[] {
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
      name: tool.name,
      description:
        tool.name === "exec"
          ? "Run JavaScript ES module source in a fresh sandboxed isolate. Default-export a function to receive input and return a result. Imports support node:fs/promises for workspace files, ws:git for git operations, and relative workspace .js modules. Git paths resolve against the working directory. There is no shell, npm, package installation, or direct network access. Use read, write and edit for plain file changes."
          : tool.description,
      parameters: tool.parameters,
      replay: REPLAY_SAFE.has(tool.name) ? "safe" : "unsafe",
      async execute(args, api, context) {
        return await execute(
          { id: api.callId, name: tool.name, arguments: args },
          { abortSignal: context.abortSignal },
        );
      },
    };

    if (tool.constrainedSampling) {
      registration.constrainedSampling = tool.constrainedSampling;
    }

    if (tool.name === "exec") {
      return { ...registration, executionMode: "sequential" };
    }

    return registration;
  });
}

export { JAVASCRIPT_BACKEND, createWorkspaceTools, workspaceStorage };
