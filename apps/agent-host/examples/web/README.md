# Agent host web example

This TanStack Start app runs an `AgentHost` Durable Object and a
`HarnessContainer` Durable Object in the same Worker. Each session opens its
ACP WebSocket through the container binding. `WORKSPACE_DIR` configures the
agent's working directory. The host always uses the container.

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

Docker must be running to create agent sessions. Put the following credentials
in `apps/agent-host/examples/web/.dev.vars`:

```dotenv
CLOUDFLARE_API_KEY=your-workers-ai-key
CLOUDFLARE_ACCOUNT_ID=your-account-id
```

Start the app:

```sh
pnpm --filter @experiments/agent-host-example-web dev
```

The dev command uses `wrangler-dev-linux --vite` from `@experiments/scripts`.
It starts Vite through the Docker API proxy that applies the Linux container
networking workaround described in [the scripts package](../../../../packages/scripts/README.md).

Open `http://localhost:3000`. Listing sessions does not start a container.
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

`wrangler.jsonc` exports both DO classes with SQLite storage, binds both
namespaces, and builds the shared harness Dockerfile. Set provider secrets
before deploying from this directory:

```sh
pnpm exec wrangler secret put CLOUDFLARE_API_KEY
pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID
pnpm deploy
```

Local credentials are not uploaded during deployment.
