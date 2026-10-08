import {
  type JsonRpcReply,
  AutomationRunStateSchema,
  AutomationStateSchema,
  InitializeResultSchema,
  SubscribeResultSchema,
  type ActionEnvelope,
  type AutomationState,
  type InitializeResult,
} from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { endpoint, MUTATIONS, test } from "./client";
import { withCleanup } from "./cleanup";
import { isWireRecord, type WireValue } from "./guards";
import { AhpConnection, initialize } from "./raw";
import { reduceAutomationState } from "./reducer";

/**
 * Automation catalogue write path: the client-dispatched definition lifecycle
 * (create, update, remove) and, behind an explicit opt-in, manual runs.
 *
 * Definition changes are durable mutations of host state, so they require
 * `AHP_TEST_MUTATIONS=1`; every test removes what it creates. Runs start
 * real agent sessions, so they additionally require
 * `AHP_TEST_AUTOMATION_RUNS=1`.
 *
 * The authoritative result of a side-effect request arrives through an
 * `automation/set` action, not through the echo, so each test compares a
 * fresh-subscribe snapshot against the reduced state.
 */

const AUTOMATIONS = "ahp-automations://";

const RUNS_OPT_IN = process.env.AHP_TEST_AUTOMATION_RUNS === "1";

type EchoProbe = {
  connection: AhpConnection;
  resource: string;
  type: string;
  clientSeq: number;
  after: number;
};

type AutomationDispatchAction =
  | {
      type: "automation/createRequested";
      resource: string;
      definition: {
        title: string;
        message: { text: string; origin: { kind: "automation" } };
        session: Record<string, never>;
        enabled: boolean;
        triggers: [];
      };
    }
  | { type: "automation/updateRequested"; resource: string; changes: { title: string } }
  | { type: "automation/removed"; resource: string }
  | { type: "automationRun/cancelRequested" };

function isWireString(value: WireValue | undefined): value is string {
  return typeof value === "string";
}

/** Extract the run resource URI from a raw runAutomation reply. */
function resultResource(reply: JsonRpcReply): string | null {
  if (!("result" in reply)) {
    return null;
  }

  const { result } = reply;

  if (!isWireRecord(result)) {
    return null;
  }

  const { resource } = result;

  return isWireString(resource) ? resource : null;
}

function accepted(envelope: ActionEnvelope): boolean {
  return !("rejectionReason" in envelope);
}

/** True when the action's target resource matches, narrowed without casts. */
function targetsResource(action: ActionEnvelope["action"], resource: string): boolean {
  const payload = action;

  if (
    payload.type === "automation/createRequested" ||
    payload.type === "automation/updateRequested" ||
    payload.type === "automation/removed"
  ) {
    return payload.resource === resource;
  }

  if (payload.type === "automation/set") {
    return payload.automation.resource === resource;
  }

  return false;
}

async function initializeFor(connection: AhpConnection): Promise<InitializeResult> {
  const reply = await initialize(connection, []);

  if (!("result" in reply)) {
    throw new Error("Initialize failed");
  }

  return InitializeResultSchema.parse(reply.result);
}

async function catalogueSnapshot(connection: AhpConnection): Promise<AutomationState> {
  const reply = await connection.request("subscribe", { channel: AUTOMATIONS });

  if (!("result" in reply)) {
    throw new Error("Subscribe to the automation catalogue failed");
  }

  const { snapshot } = SubscribeResultSchema.parse(reply.result);

  if (!snapshot) {
    throw new Error("The automation catalogue returned no snapshot");
  }

  expect(snapshot.resource).toBe(AUTOMATIONS);

  return AutomationStateSchema.parse(snapshot.state);
}

function dispatch(
  connection: AhpConnection,
  channel: string,
  clientSeq: number,
  action: AutomationDispatchAction,
): void {
  connection.notify("dispatchAction", {
    channel,
    clientSeq,
    action,
  });
}

async function waitForEcho(probe: EchoProbe): Promise<ActionEnvelope> {
  const envelope = await probe.connection.waitForAction(AUTOMATIONS, probe.type, {
    after: probe.after,
    predicate: (action) => {
      if (!accepted(action) || action.origin?.clientSeq !== probe.clientSeq) {
        return false;
      }

      return targetsResource(action.action, probe.resource);
    },
  });

  expect(envelope.rejectionReason).toBeUndefined();

  return envelope;
}

async function waitForSet(
  connection: AhpConnection,
  resource: string,
  after: number,
): Promise<ActionEnvelope> {
  const envelope = await connection.waitForAction(AUTOMATIONS, "automation/set", {
    after,
    predicate: (action) => accepted(action) && targetsResource(action.action, resource),
  });

  expect(envelope.rejectionReason).toBeUndefined();

  return envelope;
}

async function createAutomation(
  connection: AhpConnection,
): Promise<{ resource: string; setEnvelope: ActionEnvelope }> {
  const resource = `ahp-automation:/${crypto.randomUUID()}`;
  const { checkpoint } = connection;
  const clientSeq = 1;

  dispatch(connection, AUTOMATIONS, clientSeq, {
    type: "automation/createRequested",
    resource,
    definition: {
      title: `AHP conformance ${crypto.randomUUID()}`,
      message: {
        text: "Conformance automation",
        origin: { kind: "automation" },
      },
      session: {},
      enabled: false,
      triggers: [],
    },
  });

  await waitForEcho({
    connection,
    resource,
    type: "automation/createRequested",
    clientSeq,
    after: checkpoint,
  });

  const setEnvelope = await waitForSet(connection, resource, checkpoint);

  return { resource, setEnvelope };
}

async function removeAutomation(connection: AhpConnection, resource: string): Promise<void> {
  const { checkpoint } = connection;

  dispatch(connection, AUTOMATIONS, 2, {
    type: "automation/removed",
    resource,
  });

  await waitForEcho({
    connection,
    resource,
    type: "automation/removed",
    clientSeq: 2,
    after: checkpoint,
  });
}

async function runOnce(
  connection: AhpConnection,
  resource: string,
  requestId: string,
): Promise<JsonRpcReply> {
  return await connection.request("runAutomation", {
    channel: AUTOMATIONS,
    automation: resource,
    requestId,
  });
}

async function verifyRunIdempotency(
  connection: AhpConnection,
  resource: string,
  requestId: string,
  first: JsonRpcReply,
): Promise<void> {
  const runResource = resultResource(first);

  if (runResource === null) {
    throw new Error("runAutomation returned no run resource");
  }

  expect(runResource.startsWith("ahp-automation-run:/")).toBe(true);

  const retry = await runOnce(connection, resource, requestId);

  expect(retry).toEqual(first);
}

async function verifyRunChannel(
  connection: AhpConnection,
  resource: string,
  runResource: string,
): Promise<void> {
  const reply = await connection.request("subscribe", { channel: runResource });

  if (!("result" in reply)) {
    throw new Error("Subscribing to the run channel failed");
  }

  const runSnapshot = SubscribeResultSchema.parse(reply.result).snapshot;

  if (!runSnapshot) {
    throw new Error("The run channel returned no snapshot");
  }

  const run = AutomationRunStateSchema.parse(runSnapshot.state);

  expect(run.resource).toBe(runResource);
  expect(run.automation).toBe(resource);
  expect(run.origin.kind).toBe("manual");
  expect(["pending", "running", "completed", "failed", "cancelled"]).toContain(
    run.lifecycle.status,
  );
}

describe("automation catalogue write path", () => {
  test.skipIf(!MUTATIONS)(
    "createRequested publishes the entry through automation/set and converges",
    async ({ skip }) => {
      const connection = await AhpConnection.open(endpoint());

      try {
        const init = await initializeFor(connection);
        skip(!init.automations, "Automations unadvertised");
        const before = await catalogueSnapshot(connection);
        const { resource, setEnvelope } = await createAutomation(connection);

        await withCleanup(
          async () => {
            const after = await catalogueSnapshot(connection);
            const expected = reduceAutomationState(before, setEnvelope.action);

            expect(after).toEqual(expected);

            const entry = after.entries.find((item) => item.resource === resource);

            expect(entry).toBeDefined();
          },
          async () => {
            await removeAutomation(connection, resource);
          },
        );
      } finally {
        await connection.close();
      }
    },
  );

  test.skipIf(!MUTATIONS)("updateRequested replaces only the changed fields", async ({ skip }) => {
    const connection = await AhpConnection.open(endpoint());

    try {
      const init = await initializeFor(connection);
      skip(!init.automations, "Automations unadvertised");
      const { resource } = await createAutomation(connection);

      await withCleanup(
        async () => {
          const before = await catalogueSnapshot(connection);
          const original = before.entries.find((item) => item.resource === resource);

          if (!original) {
            throw new Error("Created automation is missing from the catalogue");
          }

          const changed = `${original.definition.title} updated`;
          const { checkpoint } = connection;

          dispatch(connection, AUTOMATIONS, 1, {
            type: "automation/updateRequested",
            resource,
            changes: { title: changed },
          });

          const setEnvelope = await waitForSet(connection, resource, checkpoint);
          const updated = await catalogueSnapshot(connection);
          const entry = updated.entries.find((item) => item.resource === resource);

          if (!entry) {
            throw new Error("Updated automation is missing from the catalogue");
          }

          expect(entry.definition.title).toBe(changed);
          expect(entry.definition.message).toEqual(original.definition.message);
          expect(entry.definition.session).toEqual(original.definition.session);
          expect(entry.definition.enabled).toBe(original.definition.enabled);
          expect(entry.definition.triggers).toEqual(original.definition.triggers);
          expect(setEnvelope).toBeDefined();
        },
        async () => {
          await removeAutomation(connection, resource);
        },
      );
    } finally {
      await connection.close();
    }
  });

  test.skipIf(!MUTATIONS)("removed deletes the entry from the catalogue", async ({ skip }) => {
    const connection = await AhpConnection.open(endpoint());

    try {
      const init = await initializeFor(connection);
      skip(!init.automations, "Automations unadvertised");
      const { resource } = await createAutomation(connection);

      await withCleanup(
        async () => {
          await removeAutomation(connection, resource);

          const after = await catalogueSnapshot(connection);

          expect(after.entries.some((item) => item.resource === resource)).toBe(false);
        },
        async () => {
          // Removal is idempotent for unknown resources, so a second remove
          // Is a safe no-op if the scenario already removed the entry.
          const { checkpoint } = connection;

          dispatch(connection, AUTOMATIONS, 3, {
            type: "automation/removed",
            resource,
          });

          try {
            await waitForEcho({
              connection,
              resource,
              type: "automation/removed",
              clientSeq: 3,
              after: checkpoint,
            });
          } catch {
            // Best-effort cleanup only.
          }
        },
      );
    } finally {
      await connection.close();
    }
  });

  test.skipIf(!MUTATIONS || !RUNS_OPT_IN)(
    "runAutomation is idempotent by requestId and the run channel is well-formed",
    async ({ skip }) => {
      const connection = await AhpConnection.open(endpoint());

      try {
        const init = await initializeFor(connection);
        skip(!init.automations, "Automations unadvertised");
        const { resource } = await createAutomation(connection);
        const requestId = `conformance-${crypto.randomUUID()}`;

        await withCleanup(
          async () => {
            const first = await connection.request("runAutomation", {
              channel: AUTOMATIONS,
              automation: resource,
              requestId,
            });

            const runResource = resultResource(first);

            if (runResource === null) {
              throw new Error("runAutomation returned no run resource");
            }

            await verifyRunIdempotency(connection, resource, requestId, first);
            await verifyRunChannel(connection, resource, runResource);
          },
          async () => {
            await removeAutomation(connection, resource);
          },
        );
      } finally {
        await connection.close();
      }
    },
  );
});
