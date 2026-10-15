# Durable Object libraries

Reviewed against `durability` 3.0.1 and `durable-utils` 0.3.7 on 2026-10-14.
Both are dependencies of `apps/agent-host`. Check the installed version before
using these contracts after an upgrade.

## Choose the capability

| Need | Entry point |
| --- | --- |
| Retry classification and full-jitter backoff for a caller | `isErrorRetryable` from `durable-utils/do-utils`; `jitterBackoff` from `durable-utils/retries` |
| Persisted background operations with result lookup | `Durability` from `durability` |
| Replaceable logical timers | `DurabilityAlarms` from `durability` |
| Independent delivery to several fixed targets | `DurabilityFanout` from `durability` |
| Several capabilities sharing one object's alarm | `DurabilityScheduler` from `durability` |
| Shard selection informed by observed load | `DurabilityRouting` from `durability/routing` |

## Durable operations

Use the v3 class API, `new Durability({ context, handlers, ...options })`.
Each handler becomes a typed registration method accepting `{ id, payload }`.
Registration resolves with `void` after persistence. Read the eventual outcome
with `operation.getResult(id)` and narrow on `status`: `not_found`, `pending`,
`failed`, or `completed`. An HTTP endpoint can return 202 after registration and
expose a separate result lookup.

Handlers receive `{ id, operation, payload, attempt, signal }`. Validate input
at the application boundary, keep payloads and results JSON-serializable, and
pass `id` to downstream idempotency mechanisms. Delivery is at least once:
failure after an external effect but before completion persistence can repeat
the handler. Registration alone does not atomically update application tables
or downstream systems. Define an atomic handoff or reconciliation for a
business change that also needs background work.

Operation IDs are scoped to one object's retained operation records. In 3.0.1,
registering an existing ID checks the handler name but does not compare payloads.
The first payload wins for the same handler. Enforce the application's request
fingerprint contract before registration, including tenant, method, version,
and payload. A different handler using that ID throws `DuplicateDurableCallError`.

Configure `attemptTimeoutMs` and `retries.maxAttempts` globally or under
`methods.<handler>`. `retries.delay(attempt)` supplies the whole delay policy.
Defaults are five attempts, a five-minute attempt timeout, and exponential
backoff with equal jitter. Throw `NonRetryableError` for permanent failures.
An operation timeout follows normal retry policy, so propagate `signal` and
make effects idempotent even when an earlier attempt ignores cancellation.

## Alarm ownership and named timers

When combining operations, named alarms, or fanout, create one
`DurabilityScheduler({ context: this.ctx, ...options })` and pass it as
`scheduler` to every capability. Delegate the object's `alarm(info)` to
`scheduler.alarm(info)`. A standalone capability can own its scheduler through
`context` and receive delegation directly. Construct capabilities again after
reconstruction so their handlers and pending-work sources are registered.

The scheduler owns the physical alarm. Put unrelated scheduled work into named
alarms rather than independently calling `storage.setAlarm()`. Its shared FIFO
concurrency pool defaults to 10. Physical alarms have a configurable minimum
delay of 1 to 15 seconds, defaulting to 15 seconds; in-memory timers handle
nearer work with a durable fallback. Treat requested times as eligibility,
not precise execution deadlines.

`new DurabilityAlarms({ scheduler, handlers, ...options })` exposes one
scheduling method per handler. Calling `alarms.renew(at)` persists a new
occurrence, replacing that name's pending occurrence. A running handler
continues; its replacement runs afterward. Each occurrence receives an
`idempotencyKey` stable across its retries. Use that key for external effects.

Named alarm timeouts are terminal by default. Enable per-method
`retryTimeouts: true` only when effects deduplicate or reconcile ambiguous
outcomes. A timeout or abort request cannot prove the remote effect stopped.

## Storage, migrations, and retention

SQLite is the default backend. KV-only classes require `storageBackend: "kv"`
on their scheduler or standalone helper. Switching this option does not move
existing records between backends.

The helpers own their `durability_*` tables and migration history. Keep those
separate from application Drizzle migrations. SQLite construction applies the
helper's migrations. An older package can automatically revert up to two
unknown migrations using stored `down` scripts; further skew throws. Inspect
those scripts and test populated storage before downgrading. Explicit
`Durability.migrate(ctx, null)` removes its schema and records.

Operation results remain retained until purged. `purgeBefore(cutoff)` deletes
records created strictly before the cutoff regardless of status, including
pending or active work, and permits operation ID reuse. Define retention beyond
the replay window and verify active-work behavior before scheduling a purge.
Aborting an active handler during purge is best effort. Generation checks
protect replacement records, not an external service from a late effect.

## Fanout and routing

`DurabilityFanout` snapshots fixed target IDs for each accepted message.
Enqueue success means durable batch acceptance. Transport or commit exceptions
leave acceptance uncertain. Preserve identity when retrying.

Consumer targets must await `ack()`, `retry(delayMs)`, or `deadLetter()`.
Returning without settlement leaves work retryable unless that target enables
`ackOnReturn`. Storage targets acknowledge successful writes automatically.
Make each write idempotent using its supplied delivery identity. Targets
progress independently; completion order is not guaranteed.

Fanout deduplication lasts while its registration remains active and is local
to that shard. After all target deliveries settle, the manifest is removed and
its key can be reused. Consumers still need effect deduplication. Changing the
payload or recipient set for an active key rejects registration. Removing a
target leaves its pending obligations retrying until that target ID returns.

Supply `dlq` when terminal messages must remain recoverable; omitting it drops
terminal deliveries. The application owns listing, retention, and redrive.
Redrive only failed targets and delete a stored entry only after acceptance.

Routing observations reset on eviction and are advisory. Routing does not
silently retry or switch shards on failure. Choose stable shard keys for retry
affinity and preserve object-local deduplication. A location hint affects
initial placement. Configure `namespace` or `exportName` explicitly when no
Vite transform supplies the class name. Add direct dependencies before importing
optional transform or build-plugin packages.

## Caller retries with durable-utils

Use `isErrorRetryable(error)` to classify runtime failures; it excludes overload.
Use `jitterBackoff(attempt, baseDelayMs, maxDelayMs)` for full-jitter delay.
These helpers do not provide idempotency, durable scheduling, or a total deadline.
Obtain a fresh stub for each attempt, retain the operation ID, and bound both
attempt count and waiting time.

`tryN` retries every thrown error by default. Supply `isRetryable` explicitly
for DO callers and enforce the caller's deadline separately. Choose one owner
for short retries when composing this helper with durability's persisted
handler retries, queue redelivery, or another retrying caller.

## Sources

- [Durability API and delivery contracts](https://github.com/avenceslau/durability/blob/cab3415dac0af5ef792df2d7d89047f220d47ee3/packages/durability/README.md).
- [Operation registration and duplicate-ID handling](https://github.com/avenceslau/durability/blob/cab3415dac0af5ef792df2d7d89047f220d47ee3/packages/durability/src/durability.ts).
- [durable-utils retry helpers](https://github.com/lambrospetrou/durable-utils/blob/038d378b06f320e66539d3284eff5e1dfbb95b84/src/retries.ts) and [error classification](https://github.com/lambrospetrou/durable-utils/blob/038d378b06f320e66539d3284eff5e1dfbb95b84/src/do-utils.ts).
