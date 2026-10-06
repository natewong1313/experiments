# Agent host

`@experiments/agent-host` exports an abstract Durable Object class for an AHP
0.9.0 host. Consumers extend it and supply an ACP stream and agent
configuration. The consumer owns routing, authentication, and backend resources.

Implement two protected methods:

```ts
protected getAgentConfig(): AgentConfig;
protected connectAcp(options: AcpConnectionOptions): Promise<Stream>;
```

`AgentConfig` contains `agent`, the advertised AHP provider metadata, and `cwd`,
an absolute filesystem path. The host reads and validates this configuration
once per Durable Object initialization, after the subclass's fields are set.
It uses the provider and working directory for session creation, root agent
metadata, and AHP's default directory. Each session records its working directory,
which is used again when reopening that conversation.

`AcpConnectionOptions` contains a stable `sessionKey` and an `AbortSignal`. Return
a fresh ACP `Stream` with unlocked readable and writable sides, ready to exchange
JSON-RPC messages. The host owns it, initializes ACP, creates or loads the
conversation, and sends prompts and cancellation. The consumer controls
authentication and how the session key selects a backend. Backend provisioning
and resource cleanup belong to the consumer or backend.

The connection hook must honor the abort signal. Opening a stream has a 30-second
deadline; the host cancels the readable and aborts the writable of any stream
returned after that deadline. The signal applies only to the connection attempt.
Each AHP session has its own stream, even when sessions use the same backend.

After connecting, the host uses the SDK connection's `close()` method to reject
pending requests and cancel the readable on disposal, setup failure, or a request
deadline. A custom stream's readable cancellation handler must release the whole
transport. Adapters must validate incoming messages and bound transport buffers;
the host validates ACP method payloads and responses.

For Workers WebSockets, `websocketStream(socket)` from
`@experiments/agent-host/helpers` attaches
listeners, accepts the socket, and returns a ready ACP stream. Pass an unaccepted
socket to this adapter. It validates frames, bounds its incoming queue, and closes
the socket when the host cancels its readable.

For example, a remote ACP service can be connected as follows. This service uses
an `X-Session-Key` header to route back to the same backend after reconnecting:

```ts
import { AgentHost } from "@experiments/agent-host";
import { websocketStream } from "@experiments/agent-host/helpers";
import type { AgentConfig, AcpConnectionOptions, Stream } from "@experiments/agent-host";

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
  }: AcpConnectionOptions): Promise<Stream> {
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
    return websocketStream(response.webSocket);
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
`PiAgent`, or directly to an ACP service through `ACP_URL`. Those settings
belong to the example. Its [host subclass](./examples/basic/src/agent-host.ts) implements
both hooks and uses `WORKSPACE_DIR` for the ACP working directory and durable workspace.
Its [prompt client](./examples/basic/client/prompt.ts) creates an AHP session, streams a
response, and disposes the session.

```text
AHP client → consumer Worker → AgentHost DO → ACP WebSocket → consumer's backend
```

## Pi backend

The examples roll their own `PiAgent` Durable Objects that mount `PiHarness`
from the Agents SDK and connect over ACP with the [`apps/pi-acp`](../pi-acp/README.md)
conversion layer. The main package entrypoint remains independent of the Pi
backend.

## Code organization

`src/agent-host.ts` constructs the host components and delegates Durable Object
callbacks. The implementation is grouped by responsibility:

| Directory       | Responsibility                                                                         |
| --------------- | -------------------------------------------------------------------------------------- |
| `src/ahp/`      | Client connections, RPC handling, subscriptions, and client-action acceptance.         |
| `src/sessions/` | Session lifecycle, turn execution, cancellation, and restart recovery.                 |
| `src/agent/`    | ACP connections and backend conversations, including request validation and deadlines. |
| `src/state/`    | Authoritative transitions, reducers, and summary projections.                          |
| `src/storage/`  | Normalized chats, ordered parts, text pieces, content, and replay/acknowledgements.    |
| `drizzle/`      | Generated SQL migrations, migration journal, schema snapshots, and the runtime bundle. |

Protocol conversion functions live in `@experiments/protocol-schemas/acp`.
The ACP adapter uses those functions; turn execution checks session generation
and turn identity before publishing results. A session generation uses its
unique backend session key, so delayed work cannot affect a session recreated
at the same URI. Turn execution reads chat and turn metadata plus indexed part identities.
Snapshots assemble text, ordered parts, and requested completed history separately.

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
| Turn history                        | Partial               | Snapshots support `view.turns` and `turnsNextCursor`. `fetchTurns` publishes bounded pages as `chat/turnsLoaded`; full-history requests exceeding the memory budget are rejected.                                                 |
| Files and resources                 | Partial               | `resourceRead` serves immutable content owned by this host after initialization. Write, list, and resolve methods are not implemented.                                                                                            |
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

## ACP support

The workspace catalog supplies ACP TypeScript SDK `1.7.0`. The host uses its fluent
client API and the shared package's complete ACP v1 validators.

All 19 session-update variants are handled. Text, reasoning, tool progress, rich
content, and usage map to AHP chat actions. Plans, notices, compactions, subagent
activity, and session messages retain their original payloads in system notification
metadata. Large notification content, tool inputs/results, embedded resources, and
ACP raw metadata use stored content references; raw JSON is readable through
`resourceRead`. Small payloads keep their existing representation.
Commands, modes, configuration, session information, and other ACP state
persist under `session._meta.acp[acpSessionId]`. Root session information can update
the AHP title. Updates outside turns publish session metadata.

Setup updates are buffered until the ACP session ID is bound. Announced subagents
can publish output on the same connection; unrelated session IDs are ignored.
The host advertises plan, notice, compaction, subagent, and boolean configuration
update support. File access, terminal controls, authentication, elicitation, and
configuration commands remain outside the host's implemented capabilities.
Permission requests receive a cancelled response. Terminal references in tool output
do not create AHP terminal channels.

## Storage and restart behavior

SQLite stores chat metadata, turn metadata, ordered reply parts, append-only text
pieces, and immutable content separately. An append reads the target part's
identity and counters, then inserts text pieces without reading earlier text.
Tool changes use an index scoped by chat, turn, and tool identity. They update
only matching tools, including duplicate identities as required by the AHP
reducer. Part order and ACP message boundaries remain intact.

Completion reads indexed unfinished tools and applies the official reducer's
terminal transitions. It updates turn metadata and history ordering without
assembling text or completed tool results. Full snapshots still assemble the
requested state and have a separate cost.

Content above 8 KiB becomes a standard AHP content reference where the protocol
allows it. Images, embedded resources, and data URIs also use stored references.
Large `_meta` and structured results retain their exact JSON in a resource and
expose `{ contentRef }` in metadata. Equal payloads within one ACP update share a
reference. Markdown and reasoning remain inline consistently in live actions,
replay, and snapshots.

Content uses immutable `ahp-content:/…` URIs and bounded SQLite pieces. Replacement
results get new references. All versions stay readable until session disposal;
this conservative retention also covers truncated history and retained replay.
Disposal retires the resources, and subsequent journal advancement deletes them
only after replay no longer needs them. Retained content counts toward the
session budget even when a newer result has replaced it. `resourceRead` returns a
complete resource in UTF-8 or base64, without byte-range paging. It requires an
initialized connection on the root channel and only reads this host's storage.
The consumer's route authentication controls access to the host and its resources.

State, content, host sequence numbers, projected session actions, and client
acknowledgements commit in one synchronous transaction. Publications leave the
host after commit. No text batching or persistence delay is introduced. The host
stores an accepted prompt before sending it to ACP. Resending the same client
sequence and action returns its original acknowledgement without executing it
again; dispatch acknowledgements are retained independently of replay trimming.

Replay retains at most 1,000 envelopes and 2 MiB in total. Envelopes larger than
1 MiB advance the replay floor instead of entering the journal. Trimming uses
stored byte counters and indexed oldest rows, without parsing earlier envelopes.

Memory budgets bound serialized data, with room left for parsed objects,
serialization, connections, and runtime overhead:

| Operation                                   | Budget                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| Inline turn, including ordered parts        | 2 MiB, with 16 KiB reserved for completion                                      |
| Reply parts per new active turn             | 10,000                                                                          |
| New chat, turn, or reply-part metadata      | 64 KiB; terminal turn metadata has completion reserve                           |
| Complete resource response                  | 1 MiB, less 4 KiB response overhead; JSON escaping and requested encoding count |
| Retained content per session                | 64 MiB                                                                          |
| Snapshot response or session catalogue page | 4 MiB, less response overhead                                                   |
| Replayed action envelopes                   | 2 MiB and 1,000 envelopes                                                       |
| Older history page                          | 3 MiB and at most 100 turns                                                     |
| Stored session metadata                     | 64 KiB                                                                          |
| Incoming ACP queue per connection           | 2 MiB; overload fails the stream and closes the socket                          |
| Incoming ACP frame / buffered setup updates | 1 MiB each                                                                      |
| Announced subagents per connection          | 256                                                                             |
| Open or connecting ACP sessions per host    | 8                                                                               |
| Reloadable ACP connection idle time         | 60 seconds                                                                      |

Stored text and content pieces contain at most 8,192 UTF-16 code units, split
without breaking surrogate pairs. Pieces use escaped JSON strings so even a
surrogate pair split across deltas retains its exact intermediate state. New
writes stay below 64 KiB per piece. All stored pieces use this escaped format.
Retained completed history uses the platform's SQLite storage capacity, with
bounded snapshot and history reads; it has no new total-history deletion policy.

Snapshots and replay check stored byte counts before loading payloads. Replay
filters channels in SQL. A full chat snapshot still contains all retained turns
when it fits. Larger histories require `subscribe` with `view: { turns: 100 }`
and successive `fetchTurns` requests using `turnsNextCursor`. Older pages arrive
as `chat/turnsLoaded` actions before the command response. Initializing with many
chat subscriptions shares one snapshot budget; subscription URIs are deduplicated
before snapshots are loaded. Initialize without chat subscriptions if the combined
history is too large, then subscribe to chats with a view.

A streamed update that exceeds a turn, metadata, part-count, or content budget is rolled back. The host
ends the turn with a `resource-limit` error, retains previously accepted output,
and releases the agent connection. Startup reads metadata only for sessions with
interrupted work. Listing sessions
reads bounded metadata pages without loading chats.

Closed ACP connections leave the cache immediately. Reloadable connections close
after 60 seconds idle and reopen with the persisted ACP session ID. Connections
without reload support stay open until explicitly released or disconnected, within
the same connection cap. Active turns cancel idle expiry. Notifications are
serialized once and reused for all subscribers.

Session state follows the AHP 0.9 reducer: chat activity appears in
`session.chats`. Session catalogue summaries derive their activity status from
the chat and retain the session's read and archive flags. Content deltas do not
emit an unchanged chat summary. Live actions and replay reproduce snapshots.

The backend session key still uses the existing SQLite `container` column. Stored
keys, history, and dispatch acknowledgements are retained. Initialization updates
advertised agent metadata through the journal when the subclass configuration
differs from the stored metadata.

Reconnect returns retained actions. If the client has fallen behind the retained
actions or the replay exceeds its byte budget, it receives fresh snapshots.
If those snapshots exceed their budget, reconnect returns a parameter error; the
client must initialize without chat subscriptions and resubscribe with views.
Session catalogue notifications are not replayed; refresh the catalogue with `listSessions` after reconnecting.

When the host restarts, it ends each unfinished turn with `chat/error`,
`errorType: "interrupted"`, and an explanation. It retains the prompt and partial
reply. It never resends that prompt automatically. An unfinished session creation
becomes failed.

The next prompt reopens the stored ACP conversation with `session/load`.
Historical transcript updates from loading that conversation are ignored; metadata updates are retained. This assumes the
backend retains its conversation and files and supports `session/load`. If it
cannot load the recorded conversation, the host reports an error and keeps the
recorded ACP session ID. It never creates a replacement conversation silently.

Client disconnection does not stop a turn. An outgoing ACP socket keeps the host
awake while connected, including between prompts. Client WebSockets use the
Durable Object hibernation API, but the ACP socket prevents idle hibernation until
it closes. Each setup request has a 30-second deadline, prompts have a 10-minute
deadline, and cancellation has a 10-second deadline.

## Example web client

The web client subscribes with `view: { turns: 20 }` and loads older completed
turns through `fetchTurns`. It renders the most recent 100 parts of each turn;
“Show earlier output” expands that window locally. The host still sends a complete
active turn, as AHP 0.9 has no within-turn paging.

Snapshots and incoming actions are validated at their boundaries. Persistent
Immutable.js lists and identity indexes let streaming actions update affected
parts without copying or validating the full trusted state. The official reducer
handles selected parts; lifecycle changes rebuild the index. Content references
load on request through `resourceRead`, with loading and error states. Third-party
clients retain their own state and rendering costs.

## Storage measurements

`test/storage-work.test.ts` runs against real SQLite-backed Durable Objects in
the Workers test runtime. A test-only fixture runs the former document read,
reducer, chunk comparison, and document write path with the same current journal.
The runtime has no document-storage fallback. The new
path includes host transitions. Fixtures contain ASCII text and completed tools
with 512-byte inline results, plus one pending target tool. Each measured update
appends one character or confirms that tool; mixed cases do both.

| Existing turn                    | JSON bytes parsed, before → after | Audited payload bytes written, before → after | New rows read / written |
| -------------------------------- | --------------------------------- | --------------------------------------------- | ----------------------- |
| 10,000 text characters           | 10,319 → 1,119                    | 10,471 → 365                                  | 25 / 14                 |
| 100,000 text characters          | 100,319 → 1,119                   | 34,935 → 365                                  | 25 / 14                 |
| 1,000,000 text characters        | 1,000,319 → 1,119                 | 17,431 → 365                                  | 25 / 14                 |
| 10 completed tools               | 8,008 → 1,426                     | 8,218 → 706                                   | 34 / 17                 |
| 100 completed tools              | 76,318 → 1,426                    | 76,529 → 708                                  | 34 / 17                 |
| 1,000 completed tools            | 760,318 → 1,426                   | 760,530 → 710                                 | 38 / 19                 |
| 100,000 characters + 1,000 tools | 1,720,727 → 2,549                 | 1,655,558 → 1,078                             | 65 / 34                 |

Row counts come from SQLite cursors and include measurement-trigger writes.
Payload-write bytes count document chunks, text pieces, part/turn metadata, and
journal envelopes; they exclude physical pages, indexes, and small counter writes.
JSON bytes parsed measure JSON input read and decoded, not all SQLite bytes read.
The higher counts at 1,000 tools include replay eviction. These fixtures prove
bounded update work as earlier content grows, rather than a production throughput
claim. Indexed lookup still has a cost, and many duplicate target identities or
large replacement payloads increase the affected work.

Snapshot and completion costs are recorded separately in the test snapshots.
A million-character snapshot reads 132 rows; a 1,000-tool snapshot reads 1,008.
Text-only completion reads 30 rows and writes 17 regardless of text length.
Completion with one unfinished tool among 1,000 completed tools reads 41 and
writes 24. It does not read earlier text or result bodies. Finalization scales
with unfinished tools.

`pnpm --filter @experiments/agent-host-example-web measure-updates` compares the
former full-state validation wrapper with the indexed client reducer under Node.
One local run used 50 warm-up and 500 measured iterations per fixture:

| Client fixture                                | Milliseconds per iteration, before → after | CPU microseconds per iteration, before → after |
| --------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| 10,000 text characters                        | 0.0138 → 0.0076                            | 29.3 → 17.4                                    |
| 100,000 text characters                       | 0.0122 → 0.0072                            | 21.9 → 32.2                                    |
| 1,000,000 text characters                     | 0.0093 → 0.0056                            | 30.6 → 21.3                                    |
| 10 tools                                      | 0.0391 → 0.0194                            | 92.1 → 43.1                                    |
| 100 tools                                     | 0.0913 → 0.0177                            | 103.0 → 69.2                                   |
| 1,000 tools                                   | 0.7687 → 0.0144                            | 962.4 → 66.0                                   |
| 100,000 characters + 1,000 tools, two actions | 1.4814 → 0.0212                            | 1,651.6 → 100.6                                |

The script also reports process heap changes. They vary with garbage collection
and are neither retained-memory nor peak-memory measurements: the 1,000-tool
case used about 4.3 MB before and 14.4 MB after during the measured interval,
while the mixed case used 9.2 MB before and 3.2 MB after. The final wire states
are compared for equality. These timings exclude DOM rendering, network delivery,
and real backend execution. Workers CPU and heap usage were not measured; the
Workers test clock and heap APIs do not provide useful measurements here.
No production-backend smoke test or new external conformance run was performed.

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
roots, sequences, normalized sessions, conversation IDs, history, and acknowledgements remain.

Migrations 0002–0004 added normalized records and replay byte accounting;
0005 added escaped-piece encoding flags. Migration 0006 drops `document_chunks`
and the unused piece flags. Runtime storage uses normalized records and escaped
JSON pieces exclusively. Development databases using the old document format
must be reset; there is no conversion path. Existing normalized data remains.

Lookups and snapshots perform synchronous reads without opening transactions.
State changes still use synchronous transactions, and snapshots capture state
and `fromSeq` together without an asynchronous gap.

### Store method names

`lookup` methods return `null` when there is no record; `require` methods throw.
`lookupMetadata` and `requireMetadata` load session, chat, and active-turn metadata
with empty response parts. `lookupWithActiveOutput` and `requireWithActiveOutput`
also assemble the active turn's response parts and text. Neither includes completed
history. `requireSessionRecord` loads just the persisted session row, without chat
or turn records.

`readSnapshot` includes completed history, subject to its view and byte budget.
`readSnapshots`, `readReplay`, and `readResource` also perform reads. The protocol
RPC names remain `fetchTurns` and `resourceRead`; their store methods describe the
work they perform.

| Previous method                                   | Current method                                  | Behavior                                                                       |
| ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `HostStore.exists`                                | `hasSessionChannel`                             | Checks for a session or chat channel, excluding root.                          |
| `HostStore.list`                                  | `listSessions`                                  | Reads a page of session summaries.                                             |
| `HostStore.mappingState`                          | `readAgentUpdateContext`                        | Reads part counts and identities needed to map agent updates.                  |
| `HostStore.hasTurn`                               | `hasCompletedTurn`                              | Checks the completed-history index, excluding the active turn.                 |
| `HostStore.create` / `remove`                     | `createSession` / `deleteSession`               | Mutates session storage and journals the root session count.                   |
| `HostStore.bindAgent`                             | `bindAgentSession`                              | Saves the backend conversation ID.                                             |
| `HostStore.apply`                                 | `applyAction`                                   | Applies and journals one action.                                               |
| `HostStore.updateChat` / `updateAgent`            | `applyChatActions` / `applyAgentActions`        | Applies and journals a batch in one transaction.                               |
| `HostStore.fetchTurns`                            | `publishHistoryPage`                            | Reads history and journals a `turnsLoaded` event; the caller delivers it.      |
| `HostStore.previous` / `dispatch`                 | `lookupDispatchResult` / `commitDispatch`       | Reads a saved dispatch result or atomically commits a dispatch and its result. |
| `ChatStore.current` / `live`                      | `readMetadata` / `readWithActiveOutput`         | Makes the active-output loading choice explicit.                               |
| `ChatStore.save`                                  | `createChat`                                    | Inserts an empty chat; it does not update existing chats.                      |
| `ChatStore.liveSize` / `size`                     | `activeStateBytes` / `snapshotBytes`            | Counts chat metadata and active output, or adds completed history.             |
| `ChatStore.fetchTurns` / `TurnHistory.fetchTurns` | `readHistoryPage` / `readPage`                  | Reads a history page without journaling an event.                              |
| `ContentStore.normalize`                          | `storeActionContent`                            | Persists extracted content and rewrites actions to reference it.               |
| `ContentStore.retire` / `collect`                 | `retireChatContent` / `deleteRetiredContent`    | Marks content retired or deletes it once replay no longer needs it.            |
| `ActionJournal.previous` / `remember`             | `lookupDispatchResult` / `saveDispatchResult`   | Looks up or stores a result by client action origin.                           |
| `Parts.read` / `assemble` / `append`              | `parseMetadata` / `readWithText` / `appendText` | Parses part metadata, reads complete parts, or appends text pieces.            |
| `Parts.remove`                                    | `deleteTurnRecords`                             | Deletes turn metadata, parts, and text for one turn or an entire chat.         |

Names that already describe their operation, such as `recoverableSessions`,
`configureAgent`, `ActionJournal.append`, and `TurnHistory.readTurn`, are retained.
Storage helpers use their caller's transaction. Renaming does not change the
transaction boundaries, persisted schema, or protocol methods.

## Checks

Run the regression tests in the Workers runtime:

```sh
pnpm --filter @experiments/agent-host test
pnpm --filter @experiments/agent-host check-types
pnpm --filter @experiments/agent-host-example check-types
pnpm --filter @experiments/agent-host-example build
pnpm --filter @experiments/agent-host-example-web check-types
pnpm --filter @experiments/agent-host-example-web build
pnpm --filter @experiments/protocol-schemas test
pnpm --filter @experiments/protocol-schemas check-types
pnpm run lint
pnpm run format
```

The test Worker exports subclasses of the package's public `AgentHost` class.
A separate ACP backend Durable Object exercises custom provider metadata,
working directories, authentication headers, stream ownership, and conversation
restoration after eviction against a separate ACP backend.
Tests cover snapshot and replay consistency, bounded delta writes, history larger
than a SQL row across eviction, atomic rollback, schema migration, connection generation
ownership, and timestamp rejection acknowledgements. Reducer-equivalence tests
compare intermediate database and client states. A controlled ACP backend streams
large replacement results while another tool runs, with two clients, reconnect
replay, consistent snapshots, and reads of old immutable references. Queue
overload, resource ownership, JSON response budgets, and content cleanup are tested.

See the [example README](./examples/basic/README.md#conformance-checks) to run the external
AHP conformance suite against a running host.
