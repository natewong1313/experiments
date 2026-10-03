# KV

Seed the configured KV namespace, trigger the Worker path that reads or writes it, and assert both the response and stored value when relevant. Use one key per scenario or clear storage between tests.

## Vitest plugin

This example assumes the Worker reads `USERS` for `/users/123` and returns the stored JSON.

```ts
import { env, exports } from "cloudflare:workers";
import { expect, test } from "vitest";

test("reads a user from KV", async () => {
  await env.USERS.put("123", JSON.stringify({ name: "Ada" }));
  const response = await exports.default.fetch("https://example.com/users/123");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ name: "Ada" });
});
```

Use `env.USERS.get(key)` to assert a Worker write. Await each `put`, `get`, or `delete`. Plugin storage isolation is per file; call `reset()` from `cloudflare:test` between tests that need an empty namespace.

## Wrangler test harness

Get the configured binding from the Worker handle after `server.listen()`. Seed after each `server.reset()`:

```ts
const worker = server.getWorker("api-worker");
const env = await worker.getEnv();
await env.USERS.put("123", JSON.stringify({ name: "Ada" }));

const response = await worker.fetch("/users/123");
expect(await response.json()).toEqual({ name: "Ada" });
```

The local test binding verifies Worker logic and local storage interaction. If the feature depends on production KV propagation or caching, add a separate environment-level check for that behavior.

Sources: [Vitest binding access](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [harness binding access](https://developers.cloudflare.com/workers/testing/test-harness/prepare-test-state/), [KV and R2 testing recipe](https://developers.cloudflare.com/workers/testing/vitest-integration/recipes/), [isolation model](https://developers.cloudflare.com/workers/testing/vitest-integration/isolation-and-concurrency/), [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/).
