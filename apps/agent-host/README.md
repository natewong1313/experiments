# Agent host

`@experiments/agent-host` exports an abstract Durable Object class for an AHP
0.9.0 host. Consumers extend it and supply an ACP WebSocket connection and agent
configuration. The consumer owns routing, authentication, and backend resources.

Implement two protected methods:

```ts
protected getAgentConfig(): AgentConfig;
protected connectAcp(options: AcpConnectionOptions): Promise<WebSocket>;
```

`AgentConfig` contains `agent`, the advertised AHP provider metadata, and `cwd`,
an absolute filesystem path. The host reads and validates this configuration
once per Durable Object initialization, after the subclass's fields are set.
It uses the provider and working directory for session creation, root agent
metadata, and AHP's default directory. Each session records its working directory,
which is used again when reopening that conversation.

`AcpConnectionOptions` contains a stable `sessionKey` and an `AbortSignal`. Return
a dedicated, **unaccepted** Workers WebSocket. The host accepts and owns it,
initializes ACP, creates or loads the conversation, and sends prompts and
cancellation. It closes the socket on disposal or connection failure. The consumer
controls authentication and how the session key selects a backend. Backend
provisioning and resource cleanup belong to the consumer or backend.

The connection hook must honor the abort signal. Opening a socket has a 30-second
deadline; a socket returned after that deadline is closed. Each AHP session has
its own socket, even when several sessions use the same backend service.

For example, a remote ACP service can be connected as follows. This service uses
an `X-Session-Key` header to route back to the same backend after reconnecting:

```ts
import { AgentHost } from "@experiments/agent-host";
import type {
  AgentConfig,
  AcpConnectionOptions,
} from "@experiments/agent-host";

type Env = {
  ACP_ENDPOINT: string;
  ACP_TOKEN: string;
  AGENT_HOST: DurableObjectNamespace<MyHost>;
};

export class MyHost extends AgentHost<Env> {
  protected override getAgentConfig(): AgentConfig {
    return {
      agent: {
        provider: "my-agent",
        displayName: "My agent",
        description: "Remote ACP service",
        models: [],
      },
      cwd: "/project",
    };
  }

  protected override async connectAcp({
    sessionKey,
    signal,
  }: AcpConnectionOptions): Promise<WebSocket> {
    const response = await fetch(this.env.ACP_ENDPOINT, {
      headers: {
        Upgrade: "websocket",
        Authorization: `Bearer ${this.env.ACP_TOKEN}`,
        "X-Session-Key": sessionKey,
      },
      signal,
    });
    if (response.status !== 101 || !response.webSocket) {
      throw new Error(`ACP connection failed: ${response.status}`);
    }
    return response.webSocket;
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.AGENT_HOST.getByName("example").fetch(request);
  },
} satisfies ExportedHandler<Env>;
```

Declare the exported subclass with SQLite storage in the consumer's Wrangler
configuration. The base class requires no specific environment bindings or
provider secrets and has no default Worker export. The package exports TypeScript
source for Workers bundlers and remains a private workspace package.

## Self-hosting example

[examples/basic/](./examples/basic/README.md) contains a Worker that connects through a named
`HarnessContainer`, or directly to a bridge through `ACP_URL`. Those settings
belong to the example. Its [host subclass](./examples/basic/src/agent-host.ts) implements
both hooks and uses `WORKSPACE_DIR` for the ACP working directory and the container.
Its [prompt client](./examples/basic/client/prompt.ts) creates an AHP session, streams a
response, and disposes the session.

```text
AHP client → consumer Worker → AgentHost DO → ACP WebSocket → consumer's backend
```

## Code organization

`src/agent-host.ts` constructs the host components and delegates Durable Object
callbacks. The implementation is grouped by responsibility:

| Directory       | Responsibility                                                                         |
| --------------- | -------------------------------------------------------------------------------------- |
| `src/ahp/`      | Client connections, RPC handling, subscriptions, and client-action acceptance.         |
| `src/sessions/` | Session lifecycle, turn execution, cancellation, and restart recovery.                 |
| `src/agent/`    | ACP connections and backend conversations, including request validation and deadlines. |
| `src/state/`    | Authoritative transitions, reducers, and summary projections.                          |
| `src/storage/`  | Schema, chat history, chunked documents, and the action/acknowledgement journal.       |
| `drizzle/`      | Generated SQL migrations, migration journal, schema snapshots, and the runtime bundle. |

Protocol conversion functions live in `@experiments/protocol-schemas/acp`.
The ACP adapter uses those functions; turn execution checks session generation
and turn identity before publishing results. A session generation uses its
unique backend session key, so delayed work cannot affect a session recreated
at the same URI. `LiveSession` carries live chat state; snapshots load completed
history separately.

Client dispatch commits state, projected actions, and acknowledgements in one
`HostStore` transaction. Only after that commit does the host deliver the
publication and start backend work. The journal participates in the caller's
transaction. Socket attachments remain the source of client subscriptions
across hibernation.

## AHP protocol support

The host implements this subset of AHP 0.9.0. Optional protocol capabilities
that the host does not implement should not be advertised by the configured
agent.

| Protocol area                       | Support               | Behavior                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connection and subscriptions        | Supported             | `initialize`, `ping`, `subscribe`, `unsubscribe`, and `reconnect`. Reconnect returns retained actions or fresh snapshots when replay is unavailable.                                                                              |
| Provider sessions                   | Supported with limits | `createSession`, `listSessions`, and `disposeSession` work with the configured provider and fixed working directory.                                                                                                              |
| Chats and turns                     | Partial               | One default chat per session. Text prompts stream text, reasoning, and text tool results; `chat/turnCancelled` cancels the active turn. Prompts need `message.origin`, for example `{ text: "Hello", origin: { kind: "user" } }`. |
| Session and chat actions            | Partial               | Session title, read, archive, metadata, and default-chat actions are accepted. Turn start and cancellation actions are accepted on the chat. Other client-dispatched actions are rejected.                                        |
| Turn history                        | Partial               | Chat snapshots contain all retained turns. `fetchTurns` succeeds without a cursor because the snapshot already contains the history; cursor-based requests are rejected.                                                          |
| Files and resources                 | Unsupported           | Resource read, write, list, and resolve methods are not implemented.                                                                                                                                                              |
| Terminals                           | Unsupported           | Terminal channels and terminal commands are not implemented.                                                                                                                                                                      |
| Resource watches and changesets     | Unsupported           | Watch channels, changeset channels, and changeset operations are not implemented.                                                                                                                                                 |
| Annotations                         | Unsupported           | Session annotation channels and actions are not implemented.                                                                                                                                                                      |
| Automations and automation runs     | Unsupported           | Automation catalogues, scheduling, and run commands are not implemented.                                                                                                                                                          |
| Telemetry                           | Unsupported           | OTLP channels and telemetry export are not implemented.                                                                                                                                                                           |
| MCP                                 | Unsupported           | MCP relay and MCP Apps are not implemented; ACP sessions receive an empty MCP server list.                                                                                                                                        |
| Completions and permission approval | Unsupported           | Completion requests are not implemented. ACP permission requests receive a cancelled response.                                                                                                                                    |
| Authentication challenges           | Unsupported           | The consumer controls authentication for its Worker route; the host does not implement AHP authentication challenges.                                                                                                             |

The configured agent and ACP backend determine the agent and model. The host
does not support attachments, queued prompts, or additional chats.

The consumer Worker controls client authentication. The self-hosting example
exposes shared state selected by a host ID without authentication.

## Storage and restart behavior

SQLite stores session and chat state, backend session keys, ACP conversation IDs, accepted client
actions, and the last 1,000 action envelopes. The host stores an accepted turn
before sending its prompt to the ACP backend. Resending the same client sequence and
action returns its original acknowledgement without executing it again.

Session metadata, the active chat, and completed turns are stored separately.
JSON documents use 64 KiB UTF-8 chunks to stay below SQLite's row limit. Streaming
deltas update only changed chunks of the active chat; completed history is loaded
for chat snapshots. Listing sessions reads metadata without loading chat history.
State changes, replay entries, and dispatch acknowledgements commit together.

Session state follows the AHP 0.9 reducer: chat activity appears in
`session.chats`. Session catalogue summaries derive their activity status from
the chat and retain the session's read and archive flags. Content deltas do not
emit an unchanged chat summary. Live actions and replay reproduce snapshots.

The backend session key still uses the existing SQLite `container` column. Stored
keys, history, and dispatch acknowledgements are retained. Initialization updates
advertised agent metadata through the journal when the subclass configuration
differs from the stored metadata.

Reconnect returns retained actions. If the client has fallen behind the retained
actions, it receives fresh snapshots. Session catalogue notifications are not
replayed; refresh the catalogue with `listSessions` after reconnecting.

When the host restarts, it ends each unfinished turn with `chat/error`,
`errorType: "interrupted"`, and an explanation. It retains the prompt and partial
reply. It never resends that prompt automatically. An unfinished session creation
becomes failed.

The next prompt reopens the stored ACP conversation with `session/load`.
Historical updates from loading that conversation are ignored. This assumes the
backend retains its conversation and files and supports `session/load`. If it
cannot load the recorded conversation, the host reports an error and keeps the
recorded ACP session ID. It never creates a replacement conversation silently.

Client disconnection does not stop a turn. An outgoing ACP socket keeps the host
awake while connected, including between prompts. Client WebSockets use the
Durable Object hibernation API, but the ACP socket prevents idle hibernation until
it closes. Each setup request has a 30-second deadline, prompts have a 10-minute
deadline, and cancellation has a 10-second deadline.

## Database migrations

Edit `src/storage/schema.ts`, then generate a migration:

```sh
pnpm --filter @experiments/agent-host db:generate --name=describe_change
```

For a data migration, generate an empty SQL file and fill it in:

```sh
pnpm --filter @experiments/agent-host db:generate --custom --name=describe_data_change
```

Commit the SQL files, `meta/` journal and snapshots, and generated `migrations.js`
bundle in `drizzle/`. Keep `migrations.d.ts` as the bundle's TypeScript declaration.
Do not edit migrations that have already run. Drizzle Kit uses the snapshots to
generate later schema changes. Its `durable-sqlite` driver bundles the SQL for the
host, which applies pending migrations during each object's initialization.
Current Wrangler and Cloudflare's Vite plugin import `.sql` files as text by default.

The first journal entry retains the original migration timestamp, so existing
objects skip table creation. The next migration inserts an empty root only when
none exists. The host then advertises the subclass's configured agent. Existing
roots, sequences, sessions, conversation IDs, history, and acknowledgements remain.

## Checks

Run the regression tests in the Workers runtime:

```sh
pnpm --filter @experiments/agent-host test
pnpm --filter @experiments/agent-host check-types
pnpm --filter @experiments/agent-host-example check-types
pnpm --filter @experiments/agent-host-example build
pnpm run lint
pnpm run format
```

The test Worker exports subclasses of the package's public `AgentHost` class.
A separate ACP backend Durable Object exercises custom provider metadata,
working directories, authentication headers, socket ownership, and conversation
restoration after eviction without a harness container.
Tests cover snapshot and replay consistency, bounded delta writes, history larger
than a SQL row across eviction, atomic rollback, migration, connection generation
ownership, and timestamp rejection acknowledgements.

See the [example README](./examples/basic/README.md#conformance-checks) to run the external
AHP conformance suite against a running host.
