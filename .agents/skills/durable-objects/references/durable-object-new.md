# Developing with Cloudflare Durable Objects

This guide combines `durable-objects.md`, `do-infra-guide.md`, and `do-edge-cases.md`. It merges repeated advice, replaces incomplete examples, and distinguishes public platform guarantees from observations about Cloudflare's internal implementations. Public API guidance was checked against Cloudflare documentation on 2026-10-06.

A Durable Object is a restartable actor with a stable identity and private, strongly consistent storage. Choose an object boundary that owns a useful invariant, such as a room, account, inventory partition, or workflow. Keep the state and decisions for that invariant together.

## Contents

- [Lifecycle and initialization](#lifecycle-and-initialization)
- [Identity and routing](#identity-and-routing)
- [Concurrency and transactions](#concurrency-and-transactions)
- [RPC and idempotency](#rpc-and-idempotency)
- [Retries, deadlines, and cancellation](#retries-deadlines-and-cancellation)
- [External effects and recoverable work](#external-effects-and-recoverable-work)
- [Alarms and logical timers](#alarms-and-logical-timers)
- [Schema migrations and bulk work](#schema-migrations-and-bulk-work)
- [WebSockets and hibernation](#websockets-and-hibernation)
- [Capacity, observability, and testing](#capacity-observability-and-testing)
- [Shared infrastructure](#shared-infrastructure)
- [Source notes and implementation evidence](#source-notes-and-implementation-evidence)

## Lifecycle and initialization

The JavaScript instance can disappear during idle eviction, hibernation, deployment replacement, or failure. Its constructor runs again when the object is reconstructed. Design each entry point so that a new instance can continue from durable state.

Reconstruction loses instance fields, cached values, timers, promises, transient locks, client references, and partially completed in-memory workflows. Persist completion records, claims, memberships that must survive disconnection, workflow progress, scheduled work, and cleanup intent. An in-memory `busy` flag can coordinate a live instance, but cannot prove that work completed or remains owned after a restart.

Memory can still be useful for caching or sharing a pending promise. Define how to rebuild or invalidate it, and keep durable state authoritative. Hibernatable WebSocket handlers must work after the original `fetch()` has returned and after reconstruction. Recover their context from storage and socket attachments.

Synchronous constructor work finishes before another event runs. For asynchronous initialization, use `ctx.blockConcurrencyWhile()` to prevent requests from observing incomplete state. Keep it short and limited to local initialization. A thrown exception or the 30-second timeout resets the object. Do not perform ordinary request processing or slow external calls inside it. [Durable Object State API](https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile).

```typescript
constructor(ctx: DurableObjectState, env: Env) {
  super(ctx, env);

  ctx.blockConcurrencyWhile(async () => {
    await this.applySchemaMigrations();
    await this.hydrateLocalConfig();
  });
}
```

This is a constructor fragment. Both helpers must be implemented, bounded, and safe to run after reconstruction. If initialization fails, fail closed instead of accepting requests with a partly initialized schema.

A timer or background promise is not a durable job. Persist work first and arrange an alarm or another durable delivery mechanism to resume it.

## Identity and routing

A namespace and object ID determine which object's state you reach. Class exports, namespace bindings, jurisdictions, and environments determine the namespace and routing context. Treat them as deployment contracts.

- Centralize object-name derivation. Validate and canonicalize tenant IDs and entity IDs consistently.
- Authenticate the caller and authorize access before routing. An object name is not proof of permission.
- Use deterministic names for objects that must be rediscovered.
- Persist the mapping for IDs created with `newUniqueId()`.
- Include the binding or namespace, class, jurisdiction, object ID, and logical name in diagnostic context where available.
- Treat a name-format change as a data-routing migration. Existing state does not move to a newly derived ID.

A binding alias change alone need not change identity if it still refers to the same namespace. Conversely, a similar class or object name in another environment does not imply shared state.

Choose the object boundary before implementing deduplication. An operation ID is usually unique within one object's storage, not across all objects. Cross-object invariants need an explicit coordinator or a protocol for partial success and reconciliation.

For class renames or transfers, follow the deployment model used by the project. Cloudflare documents class exports and a legacy migration model. Projects using legacy migrations need explicit history, such as `renamed_classes`, to preserve existing state. Do not deploy a replacement class and assume it owns the old objects. [Class exports](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/), [legacy class migrations](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/).

Do not assume every caller is close to the object or that each region has an independent writable copy of its application state. Test the actual routing topology. Application-level multi-region replication needs explicit consistency, conflict resolution, and failover rules.

## Concurrency and transactions

Synchronous JavaScript runs without another event interrupting it. An `await` on external I/O can allow requests, RPC calls, or WebSocket events to interleave. Recheck assumptions after it.

Storage has additional protection. Input gates prevent ordinary storage reads from racing other events by default. Output gates hold outgoing messages behind outstanding durable writes. These gates make many storage-only read-modify-write sequences safe. They do not make a transaction across an HTTP request and local storage. Options such as `allowConcurrency` and `allowUnconfirmed` weaken the default protections. [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/).

For new namespaces, use SQLite-backed storage unless the project has a specific reason otherwise. SQLite-backed objects support SQL and KV access; legacy KV-backed objects do not support `storage.sql`. Changing an existing backend requires a supported migration and cutover plan. [Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

Use `transactionSync()` when several synchronous mutations must commit together and roll back together on an exception. Its callback must not be `async`, return a promise, or call external services. Keep expensive computation and unbounded loops outside the transaction.

This method fragment reserves one inventory item. The caller must also deduplicate retries if the reservation represents an externally visible operation.

```typescript
reserveOne(itemId: string): boolean {
  return this.ctx.storage.transactionSync(() => {
    const rows = this.ctx.storage.sql.exec<{ count: number }>(
      "UPDATE inventory SET count = count - 1 " +
        "WHERE id = ? AND count > 0 RETURNING count",
      itemId,
    ).toArray();

    return rows.length === 1;
  });
}
```

Keep records, indexes, mappings, resource counters, queue pointers, and operation results in the same transaction when they represent one invariant. A single conditional SQL statement can replace a separate read/check/write sequence.

Use SQL parameter bindings for values. Consume cursors before an `await`; a retained cursor is not a stable snapshot across interleaving. Use `.one()` only when exactly one row is expected, and `.toArray()[0]` when a missing row is valid. [SQL cursor behavior](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#exec).

Transaction behavior depends on the backend and API. Keep transaction callbacks replay-safe, and retry only documented transient failures with a bounded budget. Do not apply internal multi-replica conflict rules to ordinary public SQLite storage. Treat constraint violations, malformed SQL, and incompatible schemas as application or deployment failures.

## RPC and idempotency

A caller can lose a response after the object commits its work. Give mutations a stable operation ID that the caller reuses for the same logical operation. The object must atomically record the mutation and its result, then return that stored result on replay.

Bind the operation ID to the request's meaning. Reusing it with a different method, payload, tenant, or protocol version must fail. Scope it to the object and the authenticated caller's allowed operation. Define retention so the record outlives all client retries, queue redelivery, and reconciliation. Removing it makes old requests capable of executing again.

Return structured application failures instead of relying on custom error classes or arbitrary fields to survive RPC serialization. Keep transport failures separate from invalid input, conflicts, authorization failures, and missing resources.

### Atomic local mutation example

The following class and caller helper use TypeScript, a typed `ORDERS` namespace binding, and SQLite-backed storage. Generate runtime types using the project's tooling and register the class with its deployment configuration. This example covers local order creation; it does not send a payment, email, or queue message.

```typescript
import { DurableObject } from "cloudflare:workers";

export interface Env {
  ORDERS: DurableObjectNamespace<OrderDO>;
}

type Order = { id: string; status: "created" };
type CreateOrderInput = { operationId: string; orderId: string };
type RpcResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: "INVALID_ARGUMENT" | "CONFLICT" | "TEMPORARY_UNAVAILABLE";
        message: string;
        retryable: boolean;
      };
    };
type CreateOrderResult = RpcResult<Order>;

export class OrderDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.transactionSync(() => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL CHECK (status = 'created')
        );
        CREATE TABLE IF NOT EXISTS operations (
          id TEXT PRIMARY KEY,
          request_key TEXT NOT NULL,
          result TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
    });
  }

  createOrder(input: CreateOrderInput): CreateOrderResult {
    if (
      !input ||
      typeof input.operationId !== "string" ||
      typeof input.orderId !== "string" ||
      input.operationId.length === 0 || input.operationId.length > 200 ||
      input.orderId.length === 0 || input.orderId.length > 200
    ) {
      return {
        ok: false,
        error: {
          code: "INVALID_ARGUMENT",
          message: "operationId and orderId must contain 1 to 200 characters",
          retryable: false,
        },
      };
    }

    const requestKey = JSON.stringify(["createOrder", 1, input.orderId]);
    return this.ctx.storage.transactionSync(() => {
      const previous = this.ctx.storage.sql.exec<{
        request_key: string;
        result: string;
      }>(
        "SELECT request_key, result FROM operations WHERE id = ?",
        input.operationId,
      ).toArray()[0];

      if (previous) {
        if (previous.request_key !== requestKey) {
          return {
            ok: false,
            error: {
              code: "CONFLICT",
              message: "operationId was already used for a different request",
              retryable: false,
            },
          };
        }
        return JSON.parse(previous.result) as CreateOrderResult;
      }

      const existing = this.ctx.storage.sql.exec<{ id: string }>(
        "SELECT id FROM orders WHERE id = ?",
        input.orderId,
      ).toArray()[0];

      const result: CreateOrderResult = existing
        ? {
            ok: false,
            error: {
              code: "CONFLICT",
              message: "Order already exists",
              retryable: false,
            },
          }
        : { ok: true, value: { id: input.orderId, status: "created" } };

      if (result.ok) {
        this.ctx.storage.sql.exec(
          "INSERT INTO orders (id, status) VALUES (?, ?)",
          result.value.id,
          result.value.status,
        );
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO operations (id, request_key, result, created_at) " +
          "VALUES (?, ?, ?, ?)",
        input.operationId,
        requestKey,
        JSON.stringify(result),
        Date.now(),
      );
      return result;
    });
  }
}
```

The result record and order commit together. A lost response followed by a retry returns the original outcome. A storage exception propagates so the caller can inspect runtime failure flags; the method does not label every internal error as transient.

At the HTTP boundary, validate JSON and handle malformed bodies. Authenticate and authorize access, derive the object name from trusted context, and map structured errors to suitable statuses such as 400, 403, 404, 409, or 503. Accept an idempotency key that the client retains across HTTP retries. Generating a new key for every incoming attempt defeats deduplication.

## Retries, deadlines, and cancellation

For idempotent operations, Cloudflare recommends retrying runtime errors with `.retryable === true`. Do not retry `.overloaded === true`; repeated requests worsen overload. After an exception, discard that stub and obtain a fresh one for subsequent calls. `.remote` alone does not tell you whether a failure is transient. [Error handling](https://developers.cloudflare.com/durable-objects/best-practices/error-handling/).

Classify errors structurally using documented properties. Do not search error names or message text for words such as `internal`, `network`, or `timeout`. Do not retry unknown failures by default. Missing classes, deleted namespaces, authorization failures, invalid input, schema failures, and permanent resource-limit violations need correction rather than a retry loop.

Use a bounded attempt count, a total deadline, and exponential backoff with jitter. A deadline checked only before a call does not bound a stuck call. A local timeout can bound waiting, but does not prove that the remote operation stopped. Its outcome remains ambiguous until a replay or status lookup resolves it.

### Bounded caller example

This helper accompanies the order example. `objectName` must come from the application's authorized, canonical routing logic. A timeout stops local waiting; the operation ID protects local mutations when a previous call completes later.

```typescript
class RpcDeadlineExceeded extends Error {}

function withinDeadline<T>(call: Promise<T>, deadline: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const remaining = Math.max(0, deadline - Date.now());
    const timer = setTimeout(
      () => reject(new RpcDeadlineExceeded("RPC deadline exceeded")),
      remaining,
    );
    call.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

function isRetryableTransportError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const flags = error as { retryable?: unknown; overloaded?: unknown };
  return flags.overloaded !== true && flags.retryable === true;
}

async function createOrderWithRetry(
  env: Env,
  objectName: string,
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const deadline = Date.now() + 5_000;
  const maxAttempts = 4;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (Date.now() >= deadline) {
      throw new RpcDeadlineExceeded("Order outcome may be unknown; reuse operationId");
    }

    try {
      const stub = env.ORDERS.getByName(objectName);
      const result = await withinDeadline(stub.createOrder(input), deadline);
      if (result.ok || !result.error.retryable || attempt === maxAttempts - 1) {
        return result;
      }
    } catch (error) {
      if (
        error instanceof RpcDeadlineExceeded ||
        !isRetryableTransportError(error) ||
        attempt === maxAttempts - 1
      ) {
        throw error;
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new RpcDeadlineExceeded("Order outcome may be unknown; reuse operationId");
    }
    const cap = Math.min(1_000, 50 * 2 ** attempt, remaining);
    await new Promise<void>(resolve => setTimeout(resolve, Math.random() * cap));
  }
  throw new Error("Attempt budget exhausted");
}
```

The helper propagates local deadline expiry instead of immediately piling more calls onto a slow operation. A later retry or status request must reuse the same operation ID. Read-only calls usually do not need an operation record, but still need routing, error classification, and a waiting budget.

Avoid stacked retry loops. Caller retries, queue redelivery, alarm retries, workflow retries, and provider retries can multiply attempts. Designate which layer owns short retries, and propagate the operation ID and the applicable deadline through the layers.

Cancellation is a state transition. Persist cancellation intent and define when it prevents new work, what happens to in-flight effects, and how partial completion is reported. An `AbortSignal`, disconnected caller, or rejected promise alone cannot roll back a remote mutation.

## External effects and recoverable work

A local transaction cannot atomically include HTTP, payment, email, R2, queue, or another object's RPC operation. If an external effect succeeds and the instance fails before recording completion, the next invocation can send it again.

Use a durable operation or outbox record. Store the business change and effect intent together, then process the effect independently. Give the downstream provider a stable idempotency key or a deterministic resource key with appropriate conditional-write semantics. A deterministic key alone does not make every write safe.

A useful operation record includes the request fingerprint, status, result, attempts, retry time, lease expiry, ownership token, version, and checkpoint. Define transitions explicitly:

```text
pending -> running -> completed
running -> pending       transient failure or recoverable expired lease
pending/running -> failed permanent failure or exhausted application budget
pending/running -> cancelled according to the application's cancellation rules
```

For slow computation or external work:

1. In a short transaction, validate the request and create or inspect its operation record.
2. Claim eligible work with a conditional update and a new ownership token.
3. Persist the lease and a recovery wake-up before awaiting the effect.
4. Perform the effect outside the transaction using its stable downstream key.
5. Record completion only if the ownership token and version still match.
6. Reconcile expired leases and ambiguous provider outcomes.

A lease token prevents an old invocation from overwriting a new owner's local result. It does not stop an old invocation from calling an external service. For externally exclusive work, use downstream idempotency or fencing that the downstream system enforces. Make the lease longer than the expected bounded request, or renew it with ownership checks. Include clock and scheduling slack.

This SQL illustrates claim and completion conditions for a table with the listed operation fields. Execute the claim with any related scheduling changes in the appropriate storage transaction.

```sql
UPDATE operations
SET status = 'running', lease_token = ?, lease_until = ?, attempts = attempts + 1
WHERE id = ? AND version = ?
  AND ((status = 'pending' AND next_attempt_at <= ?)
       OR (status = 'running' AND lease_until <= ?))
RETURNING id, payload, version;

UPDATE operations
SET status = 'completed', result = ?, lease_token = NULL, lease_until = NULL
WHERE id = ? AND version = ? AND status = 'running' AND lease_token = ?
RETURNING id;
```

Consume the `RETURNING` rows before an `await`. No returned row means the claim or completion did not match. Do not infer ownership from a cached flag. Use the same condition when recording failure or cancellation so a stale worker cannot change another owner's state.

Persist a checkpoint after each completed unit of work. If failure can occur between the effect and its checkpoint, that unit must be replay-safe. Persist intent before external I/O and completion afterward. Do not advance the checkpoint before the effect succeeds.

Avoid unbounded polling in a `while (true)` RPC method. Return `pending` with an operation ID, offer a status lookup, or wait for a bounded interval. An in-memory shared promise is only a latency optimization.

For queue consumers, acknowledge only after the required durable handoff or effects succeed according to the contract. Expect redelivery after successful work and deduplicate it. Deletion also needs durable cleanup intent and reconciliation when it spans systems.

## Alarms and logical timers

Each object has one alarm slot. `setAlarm()` replaces the current schedule. Alarms have guaranteed at-least-once execution, can run late, and automatically retry uncaught failures with exponential backoff starting at two seconds, for up to six retries. They do not repeat automatically. [Alarms API](https://developers.cloudflare.com/durable-objects/api/alarms/).

Store logical timers in a durable table with IDs, versions, deadlines, statuses, attempt counts, and payloads. Use the alarm to wake the object for the earliest eligible work or expired lease. Make duplicate and stale wake-ups harmless by querying current durable state.

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  next_page INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX jobs_pending_due ON jobs(status, due_at);
CREATE INDEX jobs_running_lease ON jobs(status, lease_until);
```

For SQLite-backed objects, an asynchronous storage transaction can include SQL writes and alarm operations. `transactionSync()` cannot await `setAlarm()`. The following method fragments accompany the table above. They illustrate atomic enqueue and scheduling, not a complete job processor.

```typescript
async enqueueJob(id: string, payload: string, dueAt: number) {
  if (!Number.isSafeInteger(dueAt) || dueAt < 0) {
    throw new Error("Invalid due time");
  }
  await this.ctx.storage.transaction(async () => {
    this.ctx.storage.sql.exec(
      "INSERT INTO jobs (id, version, due_at, status, payload, operation_id) " +
        "VALUES (?, 1, ?, 'pending', ?, ?)",
      id, dueAt, payload, `job:${id}:v1`,
    );
    await this.scheduleNextAlarm();
  });
}

private async scheduleNextAlarm() {
  const next = this.ctx.storage.sql.exec<{ wake_at: number | null }>(`
    SELECT MIN(wake_at) AS wake_at FROM (
      SELECT due_at AS wake_at FROM jobs WHERE status = 'pending'
      UNION ALL
      SELECT lease_until AS wake_at FROM jobs WHERE status = 'running'
    )
  `).one();

  if (next.wake_at !== null) {
    await this.ctx.storage.setAlarm(Math.max(Date.now(), next.wake_at));
  }
}
```

Call the scheduling helper inside a storage transaction with related durable transitions. Enqueueing a later job must not push an earlier job's alarm back. This helper recomputes the earliest deadline; it leaves an already scheduled alarm alone when there is no remaining work. A stale wake-up can return successfully after finding no eligible jobs.

An alarm handler should process a bounded batch, claim work durably, schedule lease recovery, perform external effects outside transactions, and conditionally record results. Recompute the next wake-up after transitions. Expired `running` jobs must be eligible for recovery; scanning only `pending` jobs strands work after a crash.

On transient failure, persist a future retry time with bounded exponential backoff and jitter, then reschedule. On permanent failure, persist a terminal state and report it. Handle user cancellation and administrative killswitches explicitly. For unexpected errors, allow platform retries, but monitor exhaustion and arrange reconciliation that can schedule another alarm after repairs. Catching every exception and returning success can silently abandon work.

For a reminder sender, the dangerous sequence is `pending -> sending`, email delivery, then `sent`. Recovery must revisit abandoned `sending` records, and the email provider must deduplicate the same operation key. Otherwise, a crash can strand the reminder or duplicate the email.

Avoid unconditional alarm scheduling in the constructor because it can interfere with a pending alarm. During an alarm handler, `getAlarm()` returns `null` unless the handler has set another alarm. [Constructor and alarm behavior](https://developers.cloudflare.com/durable-objects/api/alarms/#setalarm).

A very short delay is not a substitute for atomic scheduling. Store the work and wake-up together. Reconciliation is needed for exhausted retry budgets and application scheduling mistakes, rather than an assumption that alarms have no delivery guarantee.

## Schema migrations and bulk work

Separate namespace or class deployment changes from application SQL schema migrations. SQL schema changes normally run independently as each object wakes, so an object population can contain several schema versions during rollout.

- Store the schema version with the data. Apply each small migration and its version update atomically.
- Make migration invocation safe after reconstruction and observable per object.
- Test caller/object version skew and older code against an already upgraded database.
- Prefer additive changes first. Deploy readers and writers that tolerate both versions, backfill, then remove old fields only when safe.
- Define a forward repair plan. Reverting code does not revert schema or data.
- Keep large backfills out of constructor initialization and the 30-second initialization gate.
- Validate storage-backend conversion and class migration support before cutover.

Bulk work must be bounded by runtime CPU, memory, storage capacity, and the limits of the actual API. Choose a batch size from measurements. Checkpoint mutations and progress in one transaction, then schedule continuation. The source guides' internal 2,048-key and rename limits are not a public SQLite row limit.

### Resumable local backfill example

This class handles one fixed backfill, `items-v1`, and assumes positive, stable item IDs. It uses its alarm slot only for that backfill. If an object also runs other jobs, integrate it with the alarm scheduler above.

```typescript
import { DurableObject } from "cloudflare:workers";

export class MigrationDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY CHECK (id > 0),
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS migration_jobs (
        id TEXT PRIMARY KEY,
        last_id INTEGER NOT NULL,
        max_id INTEGER NOT NULL,
        status TEXT NOT NULL
      );
    `);
  }

  async startMigration() {
    await this.ctx.storage.transaction(async () => {
      const { max_id } = this.ctx.storage.sql.exec<{ max_id: number }>(
        "SELECT COALESCE(MAX(id), 0) AS max_id FROM items",
      ).one();
      this.ctx.storage.sql.exec(
        "INSERT OR IGNORE INTO migration_jobs (id, last_id, max_id, status) " +
          "VALUES ('items-v1', 0, ?, 'running')",
        max_id,
      );
      await this.ctx.storage.setAlarm(Date.now());
    });
  }

  async alarm() {
    await this.ctx.storage.transaction(async () => {
      const job = this.ctx.storage.sql.exec<{
        last_id: number; max_id: number; status: string;
      }>(
        "SELECT last_id, max_id, status FROM migration_jobs WHERE id = 'items-v1'",
      ).toArray()[0];
      if (!job || job.status === "complete") return;

      const rows = this.ctx.storage.sql.exec<{ id: number }>(
        "SELECT id FROM items WHERE id > ? AND id <= ? ORDER BY id LIMIT 500",
        job.last_id, job.max_id,
      ).toArray();

      if (rows.length === 0) {
        this.ctx.storage.sql.exec(
          "UPDATE migration_jobs SET status = 'complete' WHERE id = 'items-v1'",
        );
        return;
      }
      for (const row of rows) {
        this.ctx.storage.sql.exec(
          "UPDATE items SET status = 'migrated' WHERE id = ?", row.id,
        );
      }
      this.ctx.storage.sql.exec(
        "UPDATE migration_jobs SET last_id = ? WHERE id = 'items-v1'",
        rows[rows.length - 1].id,
      );
      await this.ctx.storage.setAlarm(Date.now() + 1_000);
    });
  }
}
```

The work, checkpoint, and continuation alarm commit together. Capturing a high-water mark makes the backfill finite. During the migration, new writes must already use the new representation, and the application must prevent late inserts behind the checkpoint or account for them with reconciliation. For changing datasets, use an explicit migration marker or another scan strategy that cannot skip rows.

The old source example accepted arbitrary job IDs but processed only `items-v1`. This example uses the fixed ID consistently. For multiple jobs, select and checkpoint each actual job ID.

Internal historical/as-of transactions cited by the source guides were read-only and time-bounded. Do not assume that API exists in public Durable Objects. For public SQLite recovery, consult the documented point-in-time recovery API and plan recovery across downstream effects and operation records. [PITR API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api).

## WebSockets and hibernation

Use the hibernation API when connections should remain open while the object is idle. Accept server sockets with `ctx.acceptWebSocket()`, then handle messages, close events, and errors through the Durable Object's handlers. Do not also call `ws.accept()` or use socket event listeners for those hibernatable sockets. [Hibernation API](https://developers.cloudflare.com/durable-objects/api/state/#acceptwebsocket).

Store small connection context with `serializeAttachment()` and recover it with `deserializeAttachment()`. Rebuild live membership from `ctx.getWebSockets()` when needed. Attachments survive hibernation of the socket's object instance; they are not a substitute for durable business data or a membership record that must survive a disconnected socket. [WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

The State API documents a maximum of 32,768 hibernatable WebSockets per object, at most 10 tags per socket, and 256 characters per tag. Attachment serialization has a 16,384-byte limit. CPU, memory, message rate, and fan-out can impose lower practical capacity. Validate serialized attachment size before accepting it. [Connection and tag limits](https://developers.cloudflare.com/durable-objects/api/state/#acceptwebsocket), [attachment limit](https://developers.cloudflare.com/durable-objects/best-practices/websockets/#websocketserializeattachment).

- Authenticate upgrades and authorize each requested room or subscription.
- Validate message size and format, and enforce rate and admission limits.
- Keep handlers bounded. Long processing and excessive buffering can cause failures.
- Deduplicate messages that mutate durable state or trigger external effects.
- Handle close and error cleanup idempotently, including abnormal disconnections such as code `1006`. Do not send reserved code `1006` in a close frame.
- Check compatibility-date behavior for automatic close replies before relying on a manual handshake.
- Use protocol sequence numbers and resynchronization when clients need ordering or replay after reconnecting.
- Shard high fan-out workloads by deterministic object IDs and define how clients discover the correct shard.

For a WebSocket upgrade through `stub.fetch()`, preserve the upgrade request and required authentication context. Validate the `101` response and returned WebSocket when the caller consumes the connection internally. A connected socket does not imply that an original object instance or handler is still resident.

## Capacity, observability, and testing

A hot object remains one actor. More objects help only if the workload and invariants can be partitioned. Do not place unrelated tenants behind one global coordinator without a measured reason. Bound in-flight work, stored queue size, payload size, and batch size. Reject or defer excess work before memory or runtime limits force failures.

Track latency separately for storage, external I/O, transport, and queue waiting. Log operation ID, attempt, protocol version, schema version, object identity, ownership token where appropriate, alarm retry information, and failure category. Avoid raw secrets or unnecessary customer payloads in logs.

Useful metrics include request and handler latency, transport failures, overloads, retries, deduplication hits, ambiguous outcomes, pending queue depth, oldest pending age, expired leases, alarm lag, migrations completed or failed, storage growth, SQL rows read and written, socket count, and broadcast fan-out. Separate DO calls, service bindings, ordinary fetches, and cross-colo paths.

Test the failures the application claims to survive:

| Scenario | Required result |
| --- | --- |
| Same operation ID sent concurrently | One local mutation; consistent stored result |
| Same ID reused with another payload | A conflict; no second mutation |
| Response lost after commit | Replay returns the stored result |
| Instance reconstructed | Progress and membership rebuild from the correct source |
| External effect succeeds before local completion | Provider deduplication or reconciliation resolves the outcome |
| Lease expires while old worker continues | Old completion cannot overwrite new ownership |
| Stale or duplicated alarm | No duplicate mutation and no abandoned running job |
| Later job enqueued before an earlier one runs | Earliest required wake-up is preserved |
| Downstream outage exceeds alarm retry budget | Visible failure and an application recovery path |
| Caller times out or cancels | Ambiguous or cancelled state is reported accurately |
| Backfill interrupted or invoked repeatedly | Atomic checkpoint and safe continuation |
| Caller and object versions differ | Compatible protocol or an explicit rejection |
| Class rename or routing change | Existing state remains reachable by the intended identity |
| Socket reconnects or closes abnormally | Cleanup and resynchronization remain correct |
| Hot object overloads | Admission control works without a retry storm |

Exercise worker-to-worker, worker-to-object, object-to-worker, and object-to-object calls where the system uses them. Include same-colo and cross-colo routing, deployment skew, and failures during in-flight work. Use local runtime tests for reproducible storage invariants and staging tests for deployment, routing, overload, and network behavior that local tests cannot establish.

## Shared infrastructure

Build shared helpers for repeated guarantees, with backend and failure semantics explicit:

- Durable, versioned operation and workflow state transitions.
- Idempotency keys, request fingerprints, stored outcomes, and retention policies.
- Bounded retries for documented transient transport or transaction failures.
- Deadlines, status lookups, cancellation, and ambiguous outcomes.
- Alarm multiplexing, bounded batches, lease recovery, and reconciliation.
- Outbox processing and downstream idempotency contracts.
- Crash recovery and durable cleanup.
- Schema and deployment migration validation and progress reporting.
- Per-object admission control, latency, queue depth, and capacity metrics.
- Consistent namespace, class, jurisdiction, and object-ID logging.
- Restart, cross-colo, deployment-skew, and replay tests.

Give each helper a concrete contract. For example, an idempotency helper must specify its scope, payload-mismatch behavior, atomicity boundary, retention period, and downstream limitations. A retry helper must distinguish overload and permanent errors from documented transient failures. Add these pieces as the application needs them rather than hiding all behavior behind a general-purpose actor framework.

## Source notes and implementation evidence

The source guides report a survey using Cloudflare's internal Lucerna Sourcegraph MCP. Repositories included `ew/edgeworker`, `wor/workflows`, `stor/durable-object-acceptance-tests`, `stor/durable-object-control-plane`, `cc/cloudchamber`, `ai-agents/lee`, `infcapeng/arc`, and `ea/expirable-durable-object`, with examples from `wr/durable-counter` and `ew/workerd`.

The following references preserve that survey's provenance. They were supplied by the original guides and were not independently rechecked here. Internal paths, observed implementation limits, and private APIs are not public platform contracts.

| Topic | Original implementation references |
| --- | --- |
| Reconstruction and socket state | `cloudflare/stor/durable-object-acceptance-tests/websockets/src/websocket-server.ts:16-21,50-67`; `cloudflare/ea/expirable-durable-object/src/expirable_do.ts:4-26` |
| Transient coordination and socket upgrade | `cloudflare/stor/durable-object-acceptance-tests/websockets/src/websocket-client.ts:35-87,89-105` |
| Identity and routing | `cloudflare/wr/durable-counter/src/index.ts:17-30`; `cloudflare/stor/durable-object-control-plane/src/index.ts:164-200` |
| Atomic related writes | `cloudflare/cc/cloudchamber/coordinator/src/data/durable-objects/libs/durable-kv-store.ts:221-253` |
| Internal multi-replica conflicts | `cloudflare/ew/edgeworker/src/edgeworker/internal-api/multi-replica.c++:43-76,107-122`; `cloudflare/ew/edgeworker/src/edgeworker/tests/actors-storage/multi-replica-transactions.ew-test-bin.c++:822-841` |
| Internal historical/as-of reads | `cloudflare/ew/edgeworker/src/edgeworker/tests/actors-storage/multi-replica-transactions.ew-test-bin.c++:844-881` |
| Schema migration frameworks | `cloudflare/ai-agents/lee/packages/agent/src/migrate.ts`; `cloudflare/infcapeng/arc/src/workers/dcp-knowledge-service/src/migrate.ts` |
| Deployment migrations | `cloudflare/cc/cloudchamber/coordinator/wrangler.jsonc:1180-1198,1257-1263` |
| Alarm scheduling | `cloudflare/ew/edgeworker/src/edgeworker/routing-supervisor/alarm-manager.c++:52-61,211-218,289-317` |
| Alarm retry classification | `cloudflare/ew/edgeworker/src/edgeworker/routing-supervisor/alarm-manager.c++:693-712,762-910,972-993` |
| Short-delay workflow scheduling | `cloudflare/wor/workflows/apps/engine/src/index.ts:4024-4055` |
| Queue acknowledgement and replay | `cloudflare/wor/workflows/apps/visualizer-controller/src/worker.rs:141-177,265-326` |
| Socket implementation limits | `cloudflare/ew/workerd/src/workerd/io/legacy-hibernation-manager.h:207-210`; `cloudflare/ew/edgeworker/src/edgeworker/api-tests/hibernatable-web-socket.ew-test:464-505` |
| Cross-colo tests and capacity metrics | `cloudflare/ew/edgeworker/src/edgeworker/tests/inter-colo-web-sockets.ew-test-bin.c++:78-169`; `cloudflare/ew/edgeworker/src/edgeworker/scheduling/metrics.*` |

The survey observed a 2,048-modified-key limit and separate rename limits in an internal multi-replica implementation. It also cited attachment rejection tests above 16 KiB and read-only historical transactions. These observations explain the original recommendations to chunk work, validate payloads, and check backend capabilities. The current public attachment limit agrees with the 16 KiB observation. Internal transaction limits and historical-read methods should not be copied into public SQLite API guidance as supported limits or methods.

Public documentation governs API usage. Start with [Durable Objects best practices](https://developers.cloudflare.com/durable-objects/best-practices/), [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [legacy KV storage](https://developers.cloudflare.com/durable-objects/api/legacy-kv-storage-api/), [error handling](https://developers.cloudflare.com/durable-objects/best-practices/error-handling/), [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), and [platform limits](https://developers.cloudflare.com/durable-objects/platform/limits/). Recheck current documentation before using a limit, changing a backend, or changing a deployment contract.
