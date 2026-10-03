# Durable Objects

Use a real namespace binding and a stable object ID or name. Exercise the Worker's route or stub, then assert stored state or responses. The Vitest plugin can inspect an object defined in its main Worker. The harness can seed and inspect SQLite-backed object storage through a built Worker.

## Vitest plugin

This example assumes `COUNTER` is a configured Durable Object whose `fetch()` increments the stored `count` and returns it.

```ts
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";

test("persists the count", async () => {
  const stub = env.COUNTER.get(env.COUNTER.idFromName("example"));
  const response = await stub.fetch("https://example.com/increment");
  expect(await response.text()).toBe("1");

  const count = await runInDurableObject(stub, async (_instance, state) => {
    return state.storage.get<number>("count");
  });
  expect(count).toBe(1);
});
```

Use `runDurableObjectAlarm(stub)` to fire and remove a scheduled alarm. Use `evictDurableObject(stub)` to tear down an instance, then call the stub again to test recovery from persisted data. These helpers only accept stubs for Durable Objects defined in the main Worker. `abortAllDurableObjects()` resets instances without deleting storage; `reset()` deletes binding data. Await storage operations and consume response bodies before cleanup. The plugin's known issues require shared storage mode for Durable Object WebSocket tests that cannot run with per-file isolation.

## Wrangler test harness

After `server.listen()` and after each `server.reset()`, seed a SQLite-backed object by binding and instance name. This example assumes the Worker increments a `counters` row at `/counter/example`.

```ts
const worker = server.getWorker("api-worker");
const storage = await worker.getDurableObjectStorage("COUNTER", {
  name: "example",
});
await storage.exec("INSERT INTO counters (id, value) VALUES (?, ?)", "example", 0);

const response = await worker.fetch("/counter/example");
await response.text();
const rows = await storage.exec<{ value: number }>(
  "SELECT value FROM counters WHERE id = ?",
  "example",
);
expect(rows).toEqual([{ value: 1 }]);
```

Use the same binding and object name that the Worker uses. Let `server.reset()` clear state between tests. The harness storage helper is documented for SQLite-backed Durable Objects; use Worker responses and stubs for other behavior.

Sources: [Durable Object testing guide](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/), [Vitest Durable Object helpers](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [harness state preparation](https://developers.cloudflare.com/workers/testing/test-harness/prepare-test-state/), [known issues](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/).
