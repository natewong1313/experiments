# Queues

Test queue producers and consumers separately when possible. A producer should send the expected body to its configured queue binding. A consumer should handle a representative batch and return the expected ack or retry result. Include malformed messages and partial failures when the handler has such branches.

## Vitest plugin: consumer

Use `createMessageBatch()` and `getQueueResult()` from `cloudflare:test` to call the exported queue handler. This example assumes the handler acknowledges each processed message and writes its body to `RESULTS` KV.

```ts
import { env } from "cloudflare:workers";
import {
  createExecutionContext,
  createMessageBatch,
  getQueueResult,
} from "cloudflare:test";
import { expect, test } from "vitest";
import worker from "../src/index";

test("acknowledges a processed message", async () => {
  const batch = createMessageBatch("jobs", [
    {
      id: "message-1",
      timestamp: new Date(1000),
      body: { userId: "123" },
    },
  ]);
  const ctx = createExecutionContext();
  await worker.queue(batch, env, ctx);
  const result = await getQueueResult(batch, ctx);

  expect(result.explicitAcks).toEqual(["message-1"]);
  expect(await env.RESULTS.get("123")).toBe("done");
});
```

If the handler calls `ackAll()` or leaves messages implicitly acknowledged, assert the appropriate `ackAll`, `explicitAcks`, `retryBatch`, and `retryMessages` fields instead.

## Vitest plugin: producer

Spy on the configured producer binding and assert the message sent by a Worker route. This example assumes `POST /jobs` calls `JOBS.send({ userId: "123" })`.

```ts
import { env, exports } from "cloudflare:workers";
import { expect, test, vi } from "vitest";

test("enqueues a job", async () => {
  const sendSpy = vi.spyOn(env.JOBS, "send");
  try {
    const response = await exports.default.fetch("https://example.com/jobs", {
      method: "POST",
      body: JSON.stringify({ userId: "123" }),
    });
    expect(response.status).toBe(202);
    await response.text();
    expect(sendSpy).toHaveBeenCalledWith({ userId: "123" });
  } finally {
    sendSpy.mockRestore();
  }
});
```

If consumer side effects would affect this test, mock `send()` with a return value that matches the installed Queue binding API, as in Cloudflare's producer unit-test recipe. A successful producer response alone does not prove that a consumer handled the message.

## Wrangler test harness

Use the harness for the built Worker's producer route and any observable downstream effect in a configured multi-Worker setup. The cited harness guides document HTTP, scheduled events, bindings, routes, and logs; they do not document a direct queue-batch dispatch method. Use the Vitest consumer helper above for deterministic ack and retry assertions.

Sources: [Vitest queue event APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [Queue producer and consumer recipe](https://developers.cloudflare.com/workers/testing/vitest-integration/recipes/), [Cloudflare's producer unit test](https://github.com/cloudflare/workers-sdk/blob/main/fixtures/vitest-plugin-examples/queues/test/queue-producer-unit.test.ts), [harness interaction APIs](https://developers.cloudflare.com/workers/testing/test-harness/interact-with-workers/).
