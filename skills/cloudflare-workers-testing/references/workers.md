# Workers

Use this reference for Worker fetch or scheduled handlers, routes, assets, and shared test setup. Adapt entry points, URLs, and assertions to the project.

## Vitest plugin

Use an ES modules Worker and a supported compatibility date. Configure the Worker from Wrangler, then run tests in the Workers runtime:

```ts
// vitest.config.ts
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
});
```

Call an imported handler directly for a unit test. Pass `env` from `cloudflare:workers` and `createExecutionContext()` from `cloudflare:test`; await `waitOnExecutionContext(ctx)` before asserting `ctx.waitUntil()` effects. For dispatch through the configured main Worker, use:

```ts
import { exports } from "cloudflare:workers";
import { expect, test } from "vitest";

test("serves the route", async () => {
  const response = await exports.default.fetch("https://example.com/health");
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("ok");
});
```

`exports.default.fetch()` shares the test isolate and Vite module resolution. It does not expose static Assets. Use the harness for built assets or production build behavior. The plugin isolates storage by test file, not by test. Call `reset()` from `cloudflare:test` between tests that need empty storage. Its injected Node compatibility flags can make test behavior differ from the deployed Worker, so verify such behavior with the production build.

## Wrangler test harness

Use a Node.js test runner. Wrangler builds Worker projects for the harness; for a project using the Cloudflare Vite plugin, run `vite build` first and point `configPath` at the generated Wrangler configuration.

```ts
import { createTestHarness } from "wrangler";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";

const server = createTestHarness({
  workers: [{ configPath: "./wrangler.jsonc" }],
});

beforeAll(async () => {
  await server.listen();
});
afterEach(async () => {
  await server.reset();
});
afterAll(async () => {
  await server.close();
});

test("serves the route", async () => {
  const response = await server.fetch("/health");
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("ok");
});
```

With multiple Workers, `server.fetch()` sends relative URLs to the first Worker and routes absolute URLs by configured routes. Use `server.getWorker(name).fetch()` to bypass routing; a named worker also supports `scheduled()`. The harness captures Worker logs with `server.getLogs()` and clears them on `reset()`.

For a scheduled handler, call `await server.getWorker("api-worker").scheduled({ cron: "0 0 * * *", scheduledTime: new Date("2026-01-01T00:00:00.000Z") })`, then assert a stored result or a captured log. The plugin offers `createScheduledController()` for direct handler tests.

For outbound HTTP or WebSocket calls in plugin tests, use `@msw/cloudflare` and reset handlers after each test. Harness Worker `fetch()` calls pass through Node's `globalThis.fetch`, so use a Node fetch spy or `msw/node`. Reject unexpected requests in either setup.

Sources: [first Vitest test](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/), [Vitest test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [isolation](https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/), [harness setup](https://developers.cloudflare.com/workers/testing/test-harness/get-started/), [harness configuration](https://developers.cloudflare.com/workers/testing/test-harness/configure/), [harness dispatch](https://developers.cloudflare.com/workers/testing/test-harness/interact-with-workers/), [outbound mocks](https://developers.cloudflare.com/workers/testing/vitest-integration/mock-outbound-requests/).
