# Workflows

Test the Worker action that starts a Workflow and assert its eventual status, output, or error. Use introspection to remove waits or replace specific steps when the test would otherwise depend on time or an external service. Dispose introspectors after each test so their state does not leak.

## Vitest plugin

Use `introspectWorkflowInstance()` when the test chooses an instance ID. This example assumes `MY_WORKFLOW` completes with `{ success: true }` once its sleeps are disabled.

```ts
import { env } from "cloudflare:workers";
import { introspectWorkflowInstance } from "cloudflare:test";
import { expect, test } from "vitest";

test("completes the workflow", async () => {
  const instance = await introspectWorkflowInstance(env.MY_WORKFLOW, "test-run");
  try {
    await instance.modify(async (modifier) => {
      await modifier.disableSleeps();
    });
    await env.MY_WORKFLOW.create({ id: "test-run" });
    await instance.waitForStatus("complete");
    expect(await instance.getOutput()).toEqual({ success: true });
  } finally {
    await instance.dispose();
  }
});
```

Use `introspectWorkflow()` and `modifyAll()` when instance IDs are created by the Worker. `mockStepResult()` and `mockEvent()` can replace a selected dependency or awaited event. Use `waitForStepResult()` or `getError()` when those are the behavior under test. The introspector can also be disposed with `await using` in projects that support explicit resource management.

## Wrangler test harness

The harness can introspect a Workflow on a named Worker. Configure modifications before the request starts the instance:

```ts
test("completes the built workflow", async () => {
  const worker = server.getWorker("api-worker");
  await using workflow = await worker.introspectWorkflow("MY_WORKFLOW");
  await workflow.modifyAll(async (modifier) => {
    await modifier.disableSleeps([{ name: "wait-for-approval" }]);
  });

  const response = await worker.fetch("/start-workflow");
  await response.text();
  const [instance] = await workflow.get();
  expect(instance).toBeDefined();
  await instance.waitForStatus("complete");
  expect(await instance.getOutput()).toEqual({ approved: true });
});
```

Adapt the step name and output to the project. If the runner cannot parse `await using`, call `dispose()` in `finally` as shown in the plugin example. Keep the shared harness `listen()`/`reset()`/`close()` lifecycle.

Sources: [Vitest Workflow APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), [harness Workflow introspection](https://developers.cloudflare.com/workers/testing/test-harness/interact-with-workers/), [Workflow testing recipe](https://developers.cloudflare.com/workers/testing/vitest-integration/recipes/).
