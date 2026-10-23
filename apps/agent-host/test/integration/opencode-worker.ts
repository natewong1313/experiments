import type { MultiAgentEnv } from "../../examples/multi-agent/src/env";
import * as z from "zod";
import { AgentConnection } from "../../src/session/agent-connection";
import type { PromptOutput } from "../../src/session/agent-connection";
import { AgentHostSession as MultiAgentSession } from "../../examples/multi-agent/src/durable-objects";

export {
  AgentHostRoot,
  AgentHostConnectionRouter,
} from "../../examples/multi-agent/src/durable-objects";

export { default } from "../../examples/multi-agent/src";

const MessageSchema = z.object({ role: z.string() });
const ModelInputSchema = z.object({ messages: z.array(MessageSchema) });

type ModelInput = z.input<typeof ModelInputSchema>;

export class AgentHostSession extends MultiAgentSession {
  private calls = 0;

  constructor(ctx: DurableObjectState, env: MultiAgentEnv) {
    super(ctx, {
      ...env,
      AI: Object.assign(env.AI, {
        run: async (_model: string, input: ModelInput) => {
          this.calls += 1;
          const { messages } = ModelInputSchema.parse(input);
          const hasResult = messages.some((message) => message.role === "tool");

          const delta = hasResult
            ? { role: "assistant", content: "The file is ready." }
            : {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "call_write",
                    type: "function",
                    function: {
                      name: "write",
                      arguments: JSON.stringify({
                        path: "/workspace/opencode.txt",
                        content: "Written by OpenCode.",
                      }),
                    },
                  },
                ],
              };

          const events = [
            { choices: [{ index: 0, delta }] },
            {
              choices: [{ index: 0, delta: {}, finish_reason: hasResult ? "stop" : "tool_calls" }],
              usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
            },
          ];

          return new Response(
            [...events.map((event) => JSON.stringify(event)), "[DONE]"]
              .map((data) => `data: ${data}\n\n`)
              .join(""),
            {
              headers: { "content-type": "text/event-stream" },
            },
          );
        },
      }),
    });
  }

  readFile(): Promise<string> {
    return this.workspace.fs.readFile("/workspace/opencode.txt", "utf8");
  }

  restart(): void {
    this.ctx.abort("Restart for integration test");
  }

  async answeredBy(): Promise<{ pi: boolean; opencode: boolean }> {
    const piSessions = await this.pi.sessions.list();
    const opencodeSessions = await this.opencode.sessions.list();

    const pi = await Promise.all(
      piSessions.map((session) => this.pi.session(session.id).messages()),
    );

    const opencode = await Promise.all(
      opencodeSessions.map((session) => this.opencode.session(session.id).messages()),
    );

    return {
      pi: pi
        .flat()
        .some((entry) => entry.model?.some((message) => message.role === "assistant") === true),
      opencode: opencode.flat().some((message) => message.type === "assistant"),
    };
  }

  async replayOperation(): Promise<{
    stopReason: string;
    repeatedStopReason: string;
    tokens: number | undefined;
    repeatedTokens: number | undefined;
    text: string;
    tools: string[];
    calls: number;
    callsAfterReplay: number;
  }> {
    const connection = new AgentConnection();

    const options = {
      stream: (): ReturnType<MultiAgentSession["connectAgent"]> =>
        this.connectAgent("", "opencode"),
      cwd: "/workspace",
      sessionId: null,
      models: [],
    };

    const sessionId = await connection.open(options);
    const first: PromptOutput[] = [];
    const replay: PromptOutput[] = [];
    const operationId = crypto.randomUUID();

    try {
      const response = await connection.prompt(
        "Write a file.",
        async (output) => {
          first.push(output);
        },
        { operationId },
      );

      connection.close();
      const { calls } = this;

      await connection.open({ ...options, sessionId });

      const repeated = await connection.prompt(
        "Ignored duplicate.",
        async (output) => {
          replay.push(output);
        },
        { operationId, reattach: true },
      );

      const updates = replay.flatMap((output) => (output.kind === "replay" ? output.updates : []));

      return {
        stopReason: response.stopReason,
        repeatedStopReason: repeated.stopReason,
        tokens: response.usage?.totalTokens,
        repeatedTokens: repeated.usage?.totalTokens,
        text: updates
          .flatMap((update) =>
            update.sessionUpdate === "agent_message_chunk" && update.content.type === "text"
              ? [update.content.text]
              : [],
          )
          .join(""),
        tools: updates.flatMap((update) =>
          update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update"
            ? [update.status ?? ""]
            : [],
        ),
        calls,
        callsAfterReplay: this.calls,
      };
    } finally {
      connection.close();
    }
  }
}
