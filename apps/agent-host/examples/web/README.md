# Agent host web example

This TanStack Start app runs an `AgentHost` and a `PiAgent` Durable Object in the
same Worker. Each session opens an ACP WebSocket through `PI_AGENT`. The agent
rolls its own Durable Object, mounts `PiHarness` from the Agents SDK, and serves
ACP with the `@experiments/pi-acp` conversion layer, using a durable SQLite
workspace. `WORKSPACE_DIR` configures its working directory.

The app connects to `/hosts/<host-id>/ahp` with the AHP TypeScript SDK.
Home selects the host. The Sessions page lists and creates sessions. The sidebar
shows live session names under Sessions; selecting a name opens `/sessions/<session-id>`.
It defaults to host `example`; enter another host ID to view that host's sessions.
The client loads all `listSessions` pages, applies root session notifications,
and reconnects with a fresh catalog after a dropped connection. Host IDs contain
1–64 letters, digits, underscores, or hyphens. Clients using the same host ID
share sessions. The page lists sessions for the selected host, not every host
Durable Object in the namespace.

## Run locally

Install dependencies from the repository root:

```sh
pnpm install
```

Wrangler authentication supplies access to the remote Workers AI binding.
The default model is `@cf/moonshotai/kimi-k2.7-code`. No Docker or provider secrets
are required. Start Vite:

```sh
pnpm --filter @experiments/agent-host-example-web dev
```

Open `http://localhost:3000`.
AHP clients can connect to `ws://localhost:3000/hosts/example/ahp` to create
sessions and send prompts. The basic example's prompt client accepts this URL:

```sh
pnpm --filter @experiments/agent-host-example prompt \
  ws://localhost:3000/hosts/example/ahp 'Say hello in one sentence.'
```

That client disposes its session when it finishes, so the session appears only
while the prompt runs. These example routes have no authentication.

## Checks and deployment

```sh
pnpm --filter @experiments/agent-host-example-web check-types
pnpm --filter @experiments/agent-host-example-web build
```

`wrangler.jsonc` declares both classes with SQLite storage and binds `AI` and
`LOADER` for model calls and workspace JavaScript execution. Set your Worker name,
then deploy:

```sh
pnpm --filter @experiments/agent-host-example-web deploy
```
