# example-monorepo

An example Turborepo monorepo using pnpm, applying the conventions documented in
[`./turborepo-best-practices.md`](./turborepo-best-practices.md).

## Structure

- `apps/agent-host` - reusable AHP host and Pi agent Durable Objects, with basic and web examples in `examples/`
- `@experiments/ui` - shared React components (no build step, consumed as source)
- `@experiments/oxlint-config` - shared oxlint configs (one `.oxlintrc.json` entrypoint per framework)
- `@experiments/typescript-config` - shared tsconfigs

## Tasks

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`         | Start all apps in watch mode                        |
| `pnpm build`       | Build all workspaces in dependency order, cached    |
| `pnpm lint`        | Lint all workspaces with oxlint (`--deny-warnings`) |
| `pnpm check-types` | Type-check all workspaces (`tsc --noEmit`)          |
| `pnpm format`      | Format the repo with Prettier                       |

Add `--filter=<workspace>` to scope any task, e.g. `pnpm build --filter=agent-host`.
