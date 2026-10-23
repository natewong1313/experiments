import type { DurableObjectStorageLike, Workspace } from "@cloudflare/computer";
import { createPiTools } from "@cloudflare/computer/tools/pi-ai";
import type { Plugin } from "@opencode/plugin";
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

function workspaceTools(workspace: Workspace): ReturnType<typeof createPiTools> {
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

  return {
    execute,
    tools: tools.map((tool) => ({
      ...tool,
      description:
        tool.name === "exec"
          ? "Run JavaScript ES module source in a fresh sandboxed isolate. Default-export a function to receive input and return a result. Imports support node:fs/promises for workspace files, ws:git for git operations, and relative workspace .js modules. Git paths resolve against the working directory. There is no shell, npm, package installation, or direct network access. Use read, write and edit for plain file changes."
          : tool.description,
    })),
  };
}

export function createWorkspaceTools(workspace: Workspace): ToolRegistration[] {
  const { tools, execute } = workspaceTools(workspace);

  return tools.map((tool): ToolRegistration => {
    const registration: ToolRegistration = {
      ...tool,
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

export function workspacePlugin(workspace: Workspace, cwd: string): Plugin.Plugin {
  const { tools, execute } = workspaceTools(workspace);

  return {
    id: "example.workspace",
    async setup(context) {
      await context.agent.transform((editor) => {
        editor.update("build", (agent) => {
          agent.system = `You are a concise coding assistant. Your durable workspace is ${cwd}. Paths are absolute. Use read, write, edit, delete, ls, find, grep and exec. exec runs JavaScript ES modules in a sandboxed isolate. There is no shell, npm or package installation.`;
        });
      });
      await context.tool.transform((editor) => {
        for (const name of ["read", "write", "edit", "patch", "glob", "grep", "shell"]) {
          editor.remove(name);
        }

        for (const tool of tools) {
          editor.add({
            name: tool.name,
            description: tool.description,
            input: tool.parameters,
            options: { codemode: false },
            async execute(input, toolContext) {
              const result = await execute(
                { id: toolContext.id, name: tool.name, arguments: input },
                { abortSignal: toolContext.signal },
              );

              const text = result.content
                .map((part) => (part.type === "text" ? part.text : ""))
                .join("\n");

              if (result.isError) {
                throw new Error(text || `${tool.name} failed`);
              }

              return { content: text };
            },
          });
        }
      });
    },
  };
}
