# example-monorepo

An example Turborepo monorepo using pnpm, applying the conventions documented in
[`./turborepo-best-practices.md`](./turborepo-best-practices.md).

## Structure

- `apps/agent-host` - reusable AHP host Durable Object, with basic and web examples in `examples/` that roll their own Pi agent Durable Objects
- `apps/pi-acp` - conversion layer from ACP WebSocket connections to a mounted Pi harness in your own Durable Object
- `@experiments/ui` - shared React components (no build step, consumed as source)
- `@experiments/oxlint-config` - shared oxlint configs (one `oxlint.config.ts` entrypoint per framework)
- `@experiments/typescript-config` - shared tsconfigs

## Tasks

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`         | Start all apps in watch mode                        |
| `pnpm build`       | Build all workspaces in dependency order, cached    |
| `pnpm lint`        | Lint all workspaces with oxlint (`--deny-warnings`) |
| `pnpm check-types` | Type-check all workspaces (`tsc --noEmit`)          |
| `pnpm format`      | Format the repo with oxfmt                          |

Add `--filter=<workspace>` to scope any task, e.g. `pnpm build --filter=agent-host`.

Commits run oxfmt and oxlint on the staged files via [lefthook](https://lefthook.dev)
(`lefthook.yml`), installed automatically by `pnpm install` through the
`prepare` script. Staged files are formatted in place and re-staged; lint
failures block the commit.
