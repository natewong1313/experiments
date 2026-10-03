# UPSTREAM — anti-slop

Vendored Oxlint JS plugin providing the `anti-slop` rules.

## Source

- Repository: https://github.com/dmmulroy/anti-slop (GitHub: `dmmulroy/anti-slop`)
- Source snapshot: commit `065e52dc69d7876cd5c0eefedeec638be9264bee`
  (`Merge pull request #41 from akshaypal912/fix/share-resolve-variable-scope`),
  the commit that introduced the current asset content. The same content is
  still present at upstream HEAD `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
  (2026-09-10).
- Snapshot identity verified by prettier-normalizing upstream
  `skills/install-anti-slop/assets/anti-slop/{index.ts,rules/*.ts,vendor/**}`
  and comparing byte-for-byte against the copies below.

## Installed paths

- Entry point: `packages/oxlint-config/anti-slop/index.ts`
- Generic rules: `packages/oxlint-config/anti-slop/rules/*.ts`, shared helpers in
  `packages/oxlint-config/anti-slop/shared/`
- Effect rules: `packages/oxlint-config/anti-slop/effect/` (vendored, NOT
  registered — the repo has no direct `effect` dependency)
- Vendored dependency: `packages/oxlint-config/anti-slop/vendor/eslint-stylistic/`
  (see `vendor/eslint-stylistic/UPSTREAM.md`)

## Intentional deviations

- Files are reformatted with the repository's Prettier defaults (2-space
  indent, double quotes, semicolons); upstream uses tabs and no semicolons.
  Formatting-only change, verified content-identical otherwise.
- `rules/no-inline-object-parameters.ts` is a local addition (not present
  upstream), registered as `anti-slop/no-inline-object-parameters`.
- The `effect` plugin is copied but not registered in any `jsPlugins`
  configuration, because no workspace declares `effect` in its manifest.
- `packages/oxlint-config/package.json` gained `"type": "module"` so Node
  loads the plugin's ES module syntax without a module-type warning. The
  package contains no `.js` files, so the flag has no other effect.

## Registration

Registered once in the shared config `packages/oxlint-config/base.json`, which
`react-internal.json`, `drizzle.json`, and `next-js.json` extend, so every
workspace inherits the plugin and its rules:

```json
{
  "jsPlugins": [
    "eslint-plugin-zod",
    { "name": "anti-slop", "specifier": "./anti-slop/index.ts" }
  ]
}
```

The relative specifier resolves against the shared config's own directory
(`packages/oxlint-config/`), which works for every consumer because pnpm
symlinks workspace packages into `node_modules`. Note that oxlint bans
_relative_ plugin specifiers in configs loaded via `extends` only for
`oxlint.config.ts` JS configs; JSON extends configs (this repo's layout)
resolve them normally, verified on oxlint 1.78.0.

All 19 `anti-slop/*` rules are enabled at `error` in `base.json`'s `rules`
(`oxc/no-accumulating-spread` was already enabled there). Individual
workspaces keep their own workspace-specific rules and overrides.

`no-runtime-typeof` runs with its official `allowInTypeGuards` option enabled:
`["error", { "allowInTypeGuards": true }]`. Named type guards are the
ruleset's sanctioned idiom for decoding genuinely dynamic values
(`no-unknown-parameters` exempts type-predicate subjects for the same
reason); without it, boundary code cannot discriminate values typed
`unknown`/`any` at all. Ordinary (non-guard) code still cannot use `typeof`.

Dependency: `@oxlint/plugins` pinned to `1.78.0` in
`packages/oxlint-config/package.json`, matching the repo-wide `oxlint@1.78.0`.

The vendored plugin is excluded from `pnpm run format` via `.prettierignore`.
