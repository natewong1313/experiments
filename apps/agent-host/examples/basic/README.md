# Self-hosting example

This Worker exports an `AgentHost` and a `PiAgent` Durable Object. The host opens
an ACP WebSocket to the named Pi agent for each session. `PiAgent` uses
`PiHarness` from the Agents SDK and stores conversations and workspace files in
SQLite. `WORKSPACE_DIR` sets the working directory.

The Worker routes `/hosts/<host-id>/ahp` to a named host. Clients using the same
host ID share sessions. IDs contain 1–64 letters, digits, underscores, or hyphens.
`GET /health` checks the Worker. These routes have no authentication.

## Run locally

From the repository root:

```sh
pnpm install
pnpm --filter @experiments/agent-host-example cf-typegen
pnpm --filter @experiments/agent-host-example dev
```

Wrangler authentication supplies access to the remote Workers AI binding.
The default model is `@cf/moonshotai/kimi-k2.7-code`. No Docker or provider secrets
are required. `LOADER` runs the workspace's JavaScript tools in Dynamic Workers.

## Send a prompt

With the Worker running:

```sh
pnpm --filter @experiments/agent-host-example prompt \
  ws://localhost:8787/hosts/example/ahp 'Say hello in one sentence.'
```

The client initializes AHP, creates a session, subscribes to its default chat,
and sends `chat/turnStarted`. It prints streamed text to stdout, reports session
and chat URIs to stderr, and disposes the session before closing.
Use [client/prompt.ts](./client/prompt.ts) as a starting point for your own client.

## Use another ACP service

An empty `ACP_URL`, the default, uses the `PI_AGENT` namespace binding.
To connect to an existing ACP WebSocket service:

```sh
pnpm --filter @experiments/agent-host-example exec wrangler dev \
  --var ACP_URL:http://127.0.0.1:8080/acp
```

The service must accept the configured working directory and support the ACP
session methods used by the host.

## Deploy your own Worker

Keep the dependencies and export both subclasses from the entrypoint. Match
class names in `durable_objects.bindings` and `exports`, retain SQLite storage,
`nodejs_compat`, `AI`, and `LOADER`, and set your Worker name before deploying:

```sh
pnpm --filter @experiments/agent-host-example deploy
```

## Checks

```sh
pnpm --filter @experiments/agent-host test
pnpm --filter @experiments/agent-host check-types
pnpm --filter @experiments/agent-host-example check-types
pnpm --filter @experiments/agent-host-example build
```

`build` dry-runs Worker deployment without publishing.

## Conformance checks

With the Worker running:

```sh
AHP_URL=ws://localhost:8787/hosts/conformance/ahp pnpm test:ahp
```

The suite skips session and chat checks unless `AHP_SESSION_URI` names an existing
ready session. See the [conformance README](../../../../packages/ahp-conformance/README.md)
for fixture details.
