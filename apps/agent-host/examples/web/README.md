# Web example

A TanStack Start app on Cloudflare Workers. This is the web frontend for the
agent host: the same Worker that serves the app also exports the
`@experiments/agent-host` Durable Objects, so the UI can talk to the host over
the Agent Host Protocol on the same origin.

The UI is intentionally barebones: plain HTML elements with Tailwind CSS v4 for
layout. There is no component or icon library.

## Stack

- [TanStack Start](https://tanstack.com/start) with file-based routing and
  server functions, built on Vite.
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) via
  `@cloudflare/vite-plugin`; `vite dev` runs the worker locally with Wrangler.
- [Tailwind CSS v4](https://tailwindcss.com) for layout. No UI component
  library; pages render plain HTML elements.
- The agent-host Durable Objects (`AgentHostRoot`, `AgentHostSession`,
  `AgentHostConnectionRouter`) from `@experiments/agent-host`, mirroring the
  [basic example](../basic).

## Worker entrypoint

The Worker is split into two source roots under `src/`:

- [`src/host/`](src/host) — the agent-host runtime: the Durable Objects and
  the Computer workspace.
- [`src/web/`](src/web) — the TanStack Start web app: routes, components, and the
  `lib/ahp` client.

Wrangler's `main` is [`src/server.ts`](src/server.ts), a custom server entrypoint
that re-exports the TanStack Start handler as the default and adds the
agent-host Durable Object exports:

- `/hosts/{host id}/ahp` is forwarded to the per-host
  `AgentHostConnectionRouter` Durable Object (the Agent Host Protocol endpoint).
- Every other request falls through to the TanStack Start SSR / server-function
  handler.

The Durable Objects live in
[`src/host/durable-objects.ts`](src/host/durable-objects.ts), and
[`src/host/workspace.ts`](src/host/workspace.ts) wires the Computer workspace
tools, both matching the basic example.

## Chat UI on AHP

[`/sessions`](src/web/routes/sessions.tsx) renders a conversation directly from
the Agent Host Protocol. [`src/web/lib/ahp/`](src/web/lib/ahp/) owns the
connection and the chat state:

- [`src/web/lib/ahp/hooks/`](src/web/lib/ahp/hooks/) — the React hooks and
  providers that own AHP connections and channels, plus the session-URI helper.
- [`src/web/lib/ahp/`](src/web/lib/ahp/) — pure readers of AHP state, plus the
  display helpers that flatten AHP strings and tool input.

| Module                        | Role                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| `hooks/ahp-context.tsx`       | Shares one AHP connection with every route.                               |
| `hooks/use-ahp-connection.ts` | Opens the WebSocket and completes the `initialize` handshake.             |
| `hooks/use-ahp-session.ts`    | Subscribes to a session channel and exposes its default chat.             |
| `hooks/use-ahp-chat.ts`       | Subscribes to a chat channel, reduces its actions, and dispatches turns.  |
| `hooks/session-catalog.tsx`   | Keeps the host's session and agent catalog in sync with the root channel. |
| `guards.ts`                   | Narrows snapshots and actions to their channel types.                     |
| `chat-phase.ts`               | Derives the interaction phase from the chat status.                       |
| `chat-model.ts`               | Reads the model of the newest turn.                                       |
| `session-phase.ts`            | Derives the activity phase from the session status.                       |
| `display.ts`                  | Flattens AHP strings and formats tool input for display.                  |

The components read `ChatState` without an intermediate message model. Each
turn carries the user message and the ordered response parts, so the renderer
switches on `ResponsePartKind` and `ToolCallStatus`:

```tsx
const connection = useAhpConnection(url);
const client = connection.status === "ready" ? connection.client : undefined;
const session = useAhpSession(client, sessionUri);
const chat = session.status === "ready" ? session.chat : undefined;
const controller = useAhpChat(client, chat);

<ChatConversation
  state={controller.state}
  onConfirmToolCall={controller.confirmToolCall}
  onConfirmToolResult={controller.confirmToolResult}
/>;
```

Two consequences are deliberate:

- **Host-authoritative state.** AHP is multi-client, and its snapshot plus
  `serverSeq` replay already covers reconnection, so the chat state stays in the
  AHP reducer and the components only render it.
- **No optimistic actions.** A dispatched action appears once the host echoes it
  back, so every client that subscribes to the chat derives the same
  conversation.

The components in [`src/web/components/chat/`](src/web/components/chat/) switch
on the AHP part kinds (`markdown`, `reasoning`, `toolCall`, `contentRef`,
`systemNotification`, `inputRequest`, `error`), so a host that emits more part
kinds renders them without changes to the client.

### Agent and model

Turns run on the Pi agent, the same wiring as the [basic example](../basic):
[`src/host/durable-objects.ts`](src/host/durable-objects.ts) starts a `PiHarness`
over the
Computer workspace tools and connects it to the session through
`@experiments/harness-acp`. The model is a Workers AI model served through the `AI`
binding, `@cf/moonshotai/kimi-k2.7-code` by default.

The `AI` binding is declared `remote` in [wrangler.jsonc](wrangler.jsonc), so a
turn calls Workers AI on your account. `wrangler dev` needs a logged-in
`wrangler` for that binding, which is why the example cannot answer a turn
without credentials.

## Session objects

Each session page has a collapsible Durable objects panel. It lists the root,
session, and recorded connection router subscriptions with their class names,
names, IDs, and subscribed channels. The class names are the `AgentHostRoot`,
`AgentHostSession`, and `AgentHostConnectionRouter` classes that the example
exports. The panel refreshes every five seconds while open. Disconnected
routers can remain listed until subscription cleanup completes.

The route loader calls the `getSessionObjects` GET server function. The
`evictObject` POST server function accepts `{ sessionId, kind, name }`, where
`kind` is `root`, `session`, or `router`. It checks the object's association
with the session before it calls the example DO's eviction RPC.

Eviction resets the object's memory and preserves durable storage. It can
interrupt turns and connections, and the next event can restart the object.
Reload the page if the chat disconnects. These controls share the example's
access policy: anyone who can use this app can evict its session objects.

## Run locally

From the repository root:

```sh
pnpm install
pnpm --filter @experiments/agent-host-web-example cf-typegen
pnpm --filter @experiments/agent-host-web-example dev
```

The dev server starts on `http://localhost:3000`. The `APP_NAME` var in
[wrangler.jsonc](wrangler.jsonc) is read by the home route's server function.
The Agent Host Protocol is available at
`ws://localhost:3000/hosts/{host id}/ahp`.

Run `wrangler login` once before the first turn: the remote `AI` binding needs
account credentials.

## Model timing diagnostics

The Worker console records `Agent timing` entries for Pi spans, including
`pi.ai.request` start and end and `pi.ai.first_chunk`, the first normalized
model stream event. `elapsedMs` measures time since that span started.

`ACP timing` entries record run and turn starts, the first message update,
the first successfully forwarded ACP update, retry start and end, and deferred
polls. Entries include the object name, ACP session ID, and timestamp for
correlation. Retries include the attempt, next retry time, and error message.
Prompt bodies and generated text are not included in timing records.

These diagnostics appear in the Worker console, separately from the browser's
inbound AHP event list. Text, reasoning, and pending tool updates now reach
that list through the normal ACP-to-AHP conversion.

## Checks

```sh
pnpm --filter @experiments/agent-host-web-example lint
pnpm --filter @experiments/agent-host-web-example test
pnpm --filter @experiments/agent-host-web-example check-types
pnpm --filter @experiments/agent-host-web-example build
```

`test` covers the chat phase and model readers with Vitest.

`build` produces the Worker bundle and type-checks. `deploy` runs the build and
publishes with `wrangler deploy`.
