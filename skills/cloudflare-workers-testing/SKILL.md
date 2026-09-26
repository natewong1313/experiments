---
name: cloudflare-workers-testing
description: Writes and maintains Cloudflare Workers tests with the Workers Vitest plugin and Wrangler's createTestHarness API. Use when testing Workers, Durable Objects, D1 migrations, KV, R2, Workflows, Queues, bindings, or routes.
---

# Cloudflare Workers testing

## Quick start

Choose the test boundary first. Use `@cloudflare/vitest-plugin` for tests that run in the Workers runtime and need direct access to handlers, bindings, or `cloudflare:test` helpers. Use Wrangler's `createTestHarness()` for tests run by Node.js against built Workers, especially routes, assets, multiple Workers, or production build behavior. The Vitest plugin can also run integration tests through `exports.default.fetch()`; those tests share the test isolate and Vite's module resolution.

For a Vitest plugin test, configure `cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })` in `vitest.config.ts`. Import `env` or `exports` from `cloudflare:workers` and event helpers from `cloudflare:test`. For a harness test, import `createTestHarness` from `wrangler`, pass `workers: [{ configPath: "./wrangler.jsonc" }]`, call `listen()` before tests, `reset()` after each test, and `close()` after the suite. See the [Workers reference](references/workers.md) for both setups.

## Workflow

1. Read the project's Worker entry point, Wrangler or Vite configuration, package versions, test runner setup, and existing test conventions. Choose the boundary that exercises the requested behavior without bypassing it.
2. For the Vitest plugin, check ES modules format, a compatible Workers date, and a Vitest version supported by the installed plugin. Reuse Wrangler configuration through `wrangler.configPath`; use `miniflare` only for test-specific overrides. Generate Worker binding types with `wrangler types` when the project uses TypeScript. Put `@cloudflare/vitest-plugin/types` in test TypeScript configuration and declare `cloudflare:workers` `ProvidedEnv` as needed.
3. For direct handler tests, pass `env` and `createExecutionContext()` to the handler. Await `waitOnExecutionContext(ctx)` before asserting effects from `ctx.waitUntil()`. For main Worker dispatch in the same isolate, call `exports.default.fetch()`.
4. For harness tests, run the Worker through its configured build. Seed bindings with `worker.getEnv()`, then dispatch requests with `server.fetch()` or `server.getWorker(name)`. Keep `listen`, `reset`, and `close` in the test lifecycle.
5. Read the reference for each product the test touches. Seed storage after each reset, await writes and background work, and assert observable Worker behavior as well as state when useful.
6. Control outbound requests at the correct boundary: `@msw/cloudflare` inside plugin tests; Node `fetch` interception or `msw/node` in harness tests. Reject unexpected requests. Reset handlers and mocks between tests.
7. Run the focused test command and type check. If behavior depends on deployed compatibility flags or build output, also verify through a production build or the harness. Report what ran and any remaining runtime gap.

## Product references

- [Workers](references/workers.md): fetch and scheduled handlers, routes, assets, network mocks, and setup.
- [Durable Objects](references/durable-objects.md): stubs, state, alarms, eviction, and SQLite storage.
- [D1 with migrations](references/d1.md): migration setup, seeding, and queries.
- [KV](references/kv.md): namespace state and Worker reads.
- [R2](references/r2.md): object writes, metadata, and body handling.
- [Workflows](references/workflows.md): introspection, steps, status, and cleanup.
- [Queues](references/queues.md): producer behavior, consumer batches, ack, and retry.

Consult the linked Cloudflare docs in each reference when package versions or APIs may have changed.
