# Multi-agent example

This Worker advertises Pi and OpenCode on the same AHP host. Clients select `provider: "pi"` or `provider: "opencode"` in `createSession`. A request without a provider uses Pi. Each session has its own durable workspace and stores its provider. Reconnecting or restarting keeps that selection.

The Worker exposes `/hosts/<host-uuid>/ahp`. Clients with the same host UUID share the catalogue, including sessions from both providers. These routes have no authentication.

## Run locally

From the repository root:

```sh
pnpm install
pnpm --filter @experiments/agent-host-multi-agent-example dev
```

Wrangler authentication supplies the remote Workers AI binding. Both providers use `@cf/moonshotai/kimi-k2.7-code`. `WORKSPACE_DIR` sets the workspace directory. `LOADER` runs workspace JavaScript tools in Dynamic Workers.

## Send a prompt

Use the same endpoint for either provider:

```sh
pnpm --filter @experiments/agent-host-multi-agent-example prompt \
  ws://localhost:8787/hosts/00000000-0000-4000-8000-000000000001/ahp \
  'Say hello from Pi.' pi

pnpm --filter @experiments/agent-host-multi-agent-example prompt \
  ws://localhost:8787/hosts/00000000-0000-4000-8000-000000000001/ahp \
  'Say hello from OpenCode.' opencode
```

The final argument selects the provider and defaults to `pi`. The client creates a session, streams one turn, and disposes the session.

Both harnesses use `@experiments/harness-acp`. OpenCode's plugin replaces its local file and shell tools with durable workspace tools. The session's Lifecycle owns the host alarms and both harnesses' recovery jobs. This example has no client-side tool approvals or structured questions.

## Checks

```sh
pnpm --filter @experiments/agent-host-multi-agent-example check-types
pnpm --filter @experiments/agent-host-multi-agent-example build
pnpm --filter @experiments/agent-host test:integration
```

`build` dry-runs deployment without publishing. Integration tests use scripted model responses without Cloudflare credentials. See [the basic example](../basic) for a Pi-only Worker.
