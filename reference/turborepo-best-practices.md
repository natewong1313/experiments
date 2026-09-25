# Turborepo Monorepo Best Practices

---

## 1. Repository layout

Every template uses the same two-directory convention, defined in `pnpm-workspace.yaml`:

```yaml
# examples/basic/pnpm-workspace.yaml
packages:
  - "apps/*"       # deployable applications (web, docs, api, admin...)
  - "packages/*"   # shareable internals (ui, logger, eslint-config, typescript-config, database...)
```

- **apps/**: things you *deploy*. Each has a framework-specific build (`next build`, `vite build`, etc.).
- **packages/**: things you *import*. Internal shared code and tooling configs.
- The Turborepo repo itself adds `docs/*`, `crates/*` (Rust), and `examples` to the workspace, with explicit exclusions (`!packages/turbo`, `!examples/non-monorepo`) for workspaces that shouldn't participate.
- Internal packages use a consistent npm scope: `@repo/ui`, `@repo/eslint-config`, `@repo/typescript-config` (design-system template uses `@acme/*` instead — the scope name doesn't matter, consistency does).

## 2. Root `package.json`

From `examples/basic/package.json` — the canonical root manifest:

```json
{
  "name": "my-turborepo",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "check-types": "turbo run check-types"
  },
  "devDependencies": {
    "prettier": "3.9.6",
    "turbo": "2.10.12",
    "typescript": "7.0.2"
  },
  "packageManager": "pnpm@11.25.0",
  "engines": { "node": ">=24" }
}
```

Best practices encoded here:
- **All versions pinned exactly** (no `^`/`~`) in every workspace for reproducibility.
- **`packageManager` field** pins the package manager version (Corepack).
- **`engines.node`** declared.
- **Root scripts are thin wrappers**: root `build` = `turbo run build`; the root itself does no building. Formatting stays at root because it operates across all files.
- **`turbo` is a devDependency**, not a global — CI and contributors get the same version from the lockfile.
- Root is `private: true` and has no `name`-based publishing concerns.

## 3. `turbo.json` — the heart of the setup

The `basic` template defines the minimal recommended task graph:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "!.next/dev/**"]
    },
    "lint": { "dependsOn": ["^lint"] },
    "check-types": { "dependsOn": ["^check-types"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

Key rules, with evidence from across the repo:

- **`$schema` on every `turbo.json`** for editor validation/completion.
- **`dependsOn: ["^build"]`** is the core pattern: a task depends on the same task in its *dependencies* (`^` = "topological dependencies"), so `ui` builds before the app that imports it. Never list sibling workspaces manually — the package graph (`workspace:*` deps) already encodes it.
- **Declare `outputs` precisely, including exclusions.** Next.js builds must exclude `.next/cache` — caching the cache is both wasteful and incorrect:
  ```
  "outputs": [".next/**", "!.next/cache/**", "!.next/dev/**"]
  ```
  Framework-specific outputs are overridden *per workspace* (see §4).
- **`dev` is always `cache: false, persistent: true`** — long-running watch processes must never be cached. Kitchen-sink additionally sets `dev: { dependsOn: ["^build"] }` so dependencies are built once before watching starts.
- **`.env*` added to `inputs`** so env-file changes bust the cache.
- **`cache: false` for any task that mutates state or is non-deterministic**: `db:migrate`, `db:push`, `db:seed`, `format:fix`, `clean` (from `examples/with-prisma` and `design-system`).
- **Declare env vars** (`"env": ["DATABASE_URL"]`) so cache hits account for them. Pair this with `eslint-plugin-turbo`'s `turbo/no-undeclared-env-vars` rule (used in `basic/packages/eslint-config/base.js`) to enforce that every env var used in a script is declared in `turbo.json`.
- **Use `inputs` to shrink/extend cache keys**. The Turborepo repo itself:
  - excludes noise: `//#lint: { "inputs": ["!pnpm-lock.yaml"] }`
  - extends defaults for out-of-workspace files: `"inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/version.txt", ...]`
- **`globalEnv` / `globalPassThroughEnv`** (repo's own root `turbo.json`): `["OS", "RUNNER_OS"]` segmented per-platform caches; `Path`, `HOME`, `TMP` etc. passed through for tools that need them.
- **Root tasks use the `//#` prefix** (e.g. `//#lint`, `//#quality`) for repo-wide checks like lint/format that don't belong to a workspace; **package-scoped overrides use `package#task`** (e.g. `"docs#lint": {}`, `"turborepo-crates#test": {...}` to give a specific workspace a different command, or `"command": null` to opt a workspace out of an inherited task).
- **`command` can be defined per-runtime and overridden per-package**:
  ```json
  "check-types": {
    "dependsOn": ["^build"],
    "command": { "javascript": ["pnpm", "exec", "tsc", "--noEmit"] }
  }
  ```
- **Synthetic "transit" tasks** for dependency-triggering: `"topo": { "dependsOn": ["^topo"] }` exists purely so changes in internal workspaces propagate to tasks that consume built artifacts. `examples/with-vitest` does the same with a `transit` task.
- **Codegen gets its own cached task** (`with-prisma`): `"generate": { "dependsOn": ["^generate"], "env": ["DATABASE_URL"], "outputs": ["generated/**"] }`, wired via `prebuild`/`predev` npm hooks.

## 4. Workspace-level `turbo.json` for per-package overrides

`kitchen-sink` apps don't repeat the whole graph — they extend the root:

```json
// kitchen-sink/apps/storefront/turbo.json
{
  "extends": ["//"],
  "tasks": {
    "build": { "outputs": [".next/**", "!.next/cache/**", "!.next/dev/**"] }
  }
}
```

- `"extends": ["//"]` inherits the root config; the workspace only overrides what differs (its `outputs`, extra `env`).
- Used by `apps/admin` (vite → `dist/**`), `apps/api` (adds `"env": ["PORT"]`), `packages/ui`, `packages/logger`.
- **Rule of thumb**: the root defines the task graph and shared inputs; each workspace declares only its own artifacts and env vars.

## 5. Internal package design

Three patterns, chosen by need:

**a) Zero-build internal packages (preferred when possible)** — `examples/basic/packages/ui`:

```json
{
  "name": "@repo/ui",
  "private": true,
  "exports": { "./*": "./src/*.tsx" }
}
```

No build step at all: bundlers consume the source directly through the workspace boundary. Simplest, fastest dev loop, and what most internal monorepo packages should be.

**b) Built dual-format packages** — when consumers need compiled output (kitchen-sink / design-system):

- `exports` maps each entrypoint to ESM + CJS + `types`
- `files: ["dist"]`, `sideEffects: false`
- built with `bunchee` or `tsup`; `dev` task runs the same tool with `--watch`
- `"version": "0.0.0"`, `"private": true` unless publishing; when publishing, set `"publishConfig": { "access": "public" }` (design-system) and manage versions with **changesets** (`.changeset/config.json` + `.github/workflows/release.yml`)

**c) Config-only packages** — zero-dependency containers for shared config:

```json
// @repo/eslint-config
{ "exports": { ".": "./index.js", "./next": "./next.js", "./react": "./react.js", "./vite": "./vite.js" } }
// @repo/typescript-config — no build, just .json files
{ "name": "@repo/typescript-config", "private": true }
```

Also in kitchen-sink: `@repo/jest-presets` (shared jest presets with `browser` and `node` entrypoints), `@repo/logger` (a plain ESM utility package).

Internal dependencies are always declared with the **`workspace:*` protocol**:

```json
"dependencies": { "@repo/logger": "workspace:*", "@repo/ui": "workspace:*" }
```

Tooling config lives in `devDependencies`: every workspace depends on `@repo/eslint-config` and `@repo/typescript-config` via `workspace:*`, so there is exactly one place to update tooling.

## 6. Shared TypeScript configuration

`packages/typescript-config/` holds a small family of tsconfigs that every workspace `extends`:

```
base.json          # strict, ESNext, moduleResolution: Bundler, skipLibCheck, noEmit
├── nextjs.json    # + next plugin, jsx: preserve, incremental
├── react-app.json
├── react-library.json   # + jsx: react-jsx
├── vite.json
└── remix.json
```

Workspaces then have tiny local tsconfigs:

```json
// packages/ui/tsconfig.json
{
  "extends": "@repo/typescript-config/react-library.json",
  "compilerOptions": { "lib": ["dom", "ES2015"], "types": ["jest", "node"] },
  "include": ["."],
  "exclude": ["dist", "build", "node_modules"]
}
```

Type checking is a first-class cached task named **`check-types`** (`tsc --noEmit`), with `dependsOn: ["^build"]` so generated artifacts (e.g. `.next/types`) exist first. Next.js apps run `next typegen && tsc --noEmit`.

## 7. Shared ESLint configuration

One `@repo/eslint-config` flat-config package with per-framework entrypoints (`./next`, `./react`, `./vite`, `./remix`). Notable details from `basic/packages/eslint-config/base.js`:

- Includes `eslint-plugin-turbo` with `turbo/no-undeclared-env-vars` — keeps `turbo.json` env declarations honest.
- `eslint-plugin-only-warn` + lint scripts use `--max-warnings 0` so warnings actually fail.
- App-level configs are one line: `import config from "@repo/eslint-config/next"; export default config;`

## 8. Naming and scripts conventions

Across every template the same task vocabulary is used, which is what makes `turbo run <task>` composable:

| Task | Meaning |
|---|---|
| `build` | production build (outputs declared) |
| `dev` | watch mode (uncached, persistent) |
| `lint` | linting, `--max-warnings 0` |
| `check-types` | `tsc --noEmit` (not "typecheck") |
| `test` | unit tests, dependsOn `^build` |
| `clean` | `rm -rf .turbo node_modules dist` |
| `generate` | codegen (e.g. prisma) |

The Turborepo repo itself additionally composes an aggregate **`quality` root task** that runs lint + format + docs checks in one `turbo run quality` invocation, with a `quality:fix` counterpart.

## 9. CI practices (from the turborepo repo's own `.github/workflows/`)

- **Remote caching in CI**: `vercel/setup-turborepo-remote-cache-action` + `TURBO_CACHE=remote:rw` so CI shares the cache with local dev. Forks (no credentials) gracefully fall back to `local:rw`.
- `turbo run ... --env-mode=strict` in CI to fail loudly on undeclared env vars.
- `--log-order=stream` for readable interleaved CI output.
- **Test sharding**: `turbo run test -- --partition hash:${{ matrix.shard }}/2` to split tests across matrix jobs.
- `concurrency: cancel-in-progress` on PR workflows to kill stale runs.
- **Conventional Commits** enforced by `lint-pr-title.yml`; husky + lint-staged run `oxfmt`/`taplo` on staged files pre-commit.
- Automated release PRs gated by a `release-review-gate.yml` job.

## 10. Supply-chain hygiene (from the repo's own `pnpm-workspace.yaml`)

```yaml
minimumReleaseAge: 2880            # only adopt npm versions ≥ 2 days old
minimumReleaseAgeExclude:          # carve-outs for security fixes
  - turbo
  - "@turbo/*"
allowBuilds:                       # explicit allowlist for dependency postinstall scripts
  esbuild: true
  sharp: true
  keytar: false
overrides:
  esbuild: 0.28.1                   # force one version of risky/forked deps
```

pnpm's `minimumReleaseAge` (delay newly published versions) and `allowBuilds` (no implicit install scripts) are cheap, high-value protections for a monorepo that CI and every contributor trusts.

---

## TL;DR — the checklist

1. `apps/*` + `packages/*` via `pnpm-workspace.yaml`; scope internal packages (`@repo/*`), pin `packageManager`, `engines`, and exact versions.
2. Root scripts are `turbo run <task>` wrappers; root `turbo.json` owns the task graph (`^build` dependencies), `dev` is always `cache:false, persistent:true`.
3. Declare precise `outputs` (and exclusions like `!.next/cache/**`), declare `env` vars, and add `.env*` to inputs. Enforce env declarations with `eslint-plugin-turbo`.
4. Override per-workspace with `extends: ["//"]` workspace `turbo.json`s; use `//#` for root tasks and `pkg#task` for package-specific commands/opt-outs; `cache:false` anything that mutates state.
5. Share tooling through config packages: `@repo/eslint-config`, `@repo/typescript-config`, test presets — consumed via `workspace:*`.
6. Default internal packages to no build step (`exports: { "./*": "./src/*.tsx" }`); only add tsup/bunchee dual-format builds when consumers need compiled output.
7. Standardize task names: `build`, `dev`, `lint`, `check-types`, `test`, `clean`, `generate`.
8. In CI: remote caching, `--env-mode=strict`, test sharding, conventional commits, pre-commit formatting hooks.
9. Lock down the supply chain: `minimumReleaseAge`, `allowBuilds`, `overrides`.
