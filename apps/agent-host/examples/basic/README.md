# Basic example

This Worker exports `AgentHost` and `AgentSession` Durable Objects. Each session
subclass owns a Pi harness and durable workspace. The host routes AHP commands to
that session and delivers its updates to clients.

`AGENT_HOST` and `AGENT_SESSION` are this example's binding names. The library
uses namespace accessors and does not require these names.

The Worker routes `/hosts/<host-uuid>/ahp` to a named host. Clients using the same
host UUID share its catalogue and sessions. `GET /health` checks the Worker.
These routes have no authentication.

## Run locally

From the repository root:

```sh
pnpm install
pnpm --filter @experiments/agent-host-example cf-typegen
pnpm --filter @experiments/agent-host-example dev
```

Wrangler authentication supplies access to the remote Workers AI binding. The
default model is `@cf/moonshotai/kimi-k2.7-code`. `WORKSPACE_DIR` sets the session's
workspace directory. `LOADER` runs JavaScript workspace tools in Dynamic Workers.

## Send a prompt

With the Worker running:

```sh
pnpm --filter @experiments/agent-host-example prompt \
  ws://localhost:8787/hosts/00000000-0000-4000-8000-000000000001/ahp \
  'Say hello in one sentence.'
```

The client initializes AHP, creates a ready session, subscribes to its default
chat, and sends a text turn. It prints streamed text, then disposes the session.
Use [client/prompt.ts](client/prompt.ts) as a starting point for a client.

Tools run within Pi. This minimal AHP implementation only presents text output;
it has no client-side tool approvals or structured questions.

## Checks

```sh
pnpm --filter @experiments/agent-host test
pnpm --filter @experiments/agent-host check-types
pnpm --filter @experiments/agent-host-example check-types
pnpm --filter @experiments/agent-host-example build
```

`build` dry-runs deployment without publishing the Worker.
