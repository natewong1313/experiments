# Durable Objects Architecture Patterns

Deep-dive patterns distilled from the architecture guide (`durable-object-new.md`).
Read the relevant section before implementing; keep public API usage checked against
Cloudflare docs — internal implementation observations are not platform contracts.

## Idempotent mutations (operation records)

A caller can lose the response after the object commits. Give every mutation a stable
operation ID the caller reuses across retries. The object must atomically record the
mutation and its result, then replay the stored result on re-submission.

- Bind the operation ID to the request's meaning: reusing it with a different method,
  payload, tenant, or protocol version must fail (compare a request fingerprint).
- Scope it to the object and authenticated caller. Define retention so the record
  outlives all client retries, queue redelivery, and reconciliation — deleting it makes
  old requests executable again.
- Store the result record and business change in one `transactionSync()`; return
  structured results `{ok: true, value} | {ok: false, error: {code, message, retryable}}`
  so failures survive RPC serialization. Keep transport failures separate from invalid
  input, conflicts, authorization, and missing resources.
- At the HTTP boundary: validate bodies, authorize before routing, map errors to
  400/403/404/409/503, and accept a client-held idempotency key (a fresh key per attempt
  defeats deduplication).

```typescript
// Inside the DO: replay-aware, all-or-nothing
const requestKey = JSON.stringify(["createOrder", 1, input.orderId]);
return this.ctx.storage.transactionSync(() => {
  const prev = exec("SELECT request_key, result FROM operations WHERE id = ?", id).toArray()[0];
  if (prev) {
    if (prev.request_key !== requestKey)
      return { ok: false, error: { code: "CONFLICT", message: "operationId reused for a different request", retryable: false } };
    return JSON.parse(prev.result); // replay stored outcome
  }
  // ...perform mutation, INSERT business rows, INSERT operations row with result...
});
```

## Concurrency, gates, and transactions

- Synchronous JS runs without interruption; an `await` on external I/O can interleave
  requests, RPC, and socket events. Recheck assumptions after awaits.
- Input gates + output gates make storage-only read-modify-write sequences safe. They do
  not extend across HTTP requests or external calls. `allowConcurrency` /
  `allowUnspecified`-style options weaken protection — know why you use them.
- `transactionSync()`: synchronous callback, no async, no awaits, no external services;
  rolls back on exception. Keep expensive work outside. Use a single conditional SQL
  statement (`UPDATE ... WHERE guard RETURNING ...`) instead of read/check/write.
- Prefer `.one()` only when exactly one row must exist; `.toArray()[0]` when empty is
  valid; consume cursors before any `await`.

## Retries, deadlines, cancellation

- Retry only documented transient failures (`retryable === true`); never retry
  `.overloaded === true` (worsens overload). After an exception, discard the stub and get
  a fresh one. `.remote` alone says nothing about transience.
- Classify structurally — never by matching message text ("internal", "timeout").
  Missing classes, deleted namespaces, auth failures, invalid input, schema breakage need
  fixes, not retry loops.
- Bound with max attempts + total deadline + exponential backoff with jitter. A local
  timeout bounds waiting only — the remote operation may still complete, leaving the
  outcome ambiguous until replay via operation ID.
- Avoid stacked retry loops (caller + queue + alarm + workflow + provider). Designate one
  layer for short retries; propagate the operation ID and deadline through layers.
- Cancellation is a state transition: persist intent, define how it stops new work, what
  happens to in-flight effects, and how partial completion is reported.

## External effects, outbox, and leases

A local transaction cannot include HTTP, payment, email, R2, queue, or another object's
RPC. If the effect succeeds and the instance dies before recording it, the next run
repeats it. Use an outbox:

1. Short transaction: validate; create/inspect the operation record.
2. Claim work with a conditional update and a fresh ownership (lease) token.
3. Persist lease + recovery wakeup before awaiting the effect.
4. Perform the effect outside the transaction with a stable downstream idempotency key.
5. Record completion only if token and version still match (`WHERE ... AND lease_token = ? AND version = ?`).
6. Reconcile expired leases and ambiguous provider outcomes.

```
pending -> running -> completed
running -> pending      (transient failure or expired lease, recoverable)
pending/running -> failed     (permanent failure or budget exhausted)
pending/running -> cancelled  (per application rules)
```

- A lease token prevents an old invocation from overwriting a new owner's *local* result;
  it does NOT stop it from calling the external service — downstream idempotency or
  fencing must cover that.
- Persist intent before external I/O and completion afterward; never advance a checkpoint
  before the effect succeeds. Every checkpoint boundary must be replay-safe.
- Queue consumers: acknowledge only after durable handoff/effects succeed; expect
  redelivery after success and deduplicate it.
- No unbounded polling in RPC: return `pending` + operation ID + status lookup.

## Alarms and logical timers

One alarm slot; `setAlarm()` replaces it; at-least-once, runs late, auto-retries
uncaught failures ~6 times (backoff from 2s), then gives up — no automatic repetition.

- Store logical timers in a durable table (id, version, due_at, status, attempts,
  payload, lease fields) indexed on `status, due_at`. Use the alarm to wake for the
  earliest eligible work or expired lease; make stale wake-ups harmless.
- Schedule the alarm inside the same storage transaction as the enqueue (async
  `transaction()` can await `setAlarm()`; `transactionSync()` cannot). Recompute the
  earliest due time so a later enqueue never pushes an earlier job's wake back.
- Handler: bounded batch → durable claim → lease recovery scheduling → external effects
  outside transactions → conditional completion → recompute next wake. Include expired
  `running` rows in recovery scans, or crashes strand work.
- Never schedule unconditionally in the constructor; `getAlarm()` is null during the handler.
- The dangerous sequence `pending → sending → send email → sent` needs recovery of
  abandoned `sending` rows plus provider-side dedup by operation key.

## Schema migrations and backfills

- Separate deployment (class/namespace) changes from app SQL schema migrations; run
  small migrations atomically per object with a stored schema version; expect version
  skew across the fleet during rollout.
- Prefer additive changes: ship tolerant readers/writers, backfill, then remove old fields.
- Keep large backfills out of constructors and the 30s init gate. Do resumable,
  bounded-batch backfills driven by the alarm: checkpoint (batch + progress) commits
  atomically, then schedules continuation. Use a high-water mark for stable datasets;
  explicit markers for changing ones. Deploy replacement classes do not inherit old state;
  legacy migrations need explicit `renamed_classes` history.

## WebSockets and hibernation

- Hibernation keeps connections alive while the object is idle: `ctx.acceptWebSocket()`,
  handle messages/close/errors via DO handlers — do not also call `ws.accept()` or use
  socket event listeners for hibernatable sockets.
- `serializeAttachment()` (≤16 KiB) holds small per-socket context; rebuild live
  membership from `ctx.getWebSockets()`. Attachments survive hibernation but are not
  durable business data. Limits: 32,768 sockets/object, 10 tags/socket, 256-char tags.
- Authenticate the upgrade and authorize the room/subscription; validate message size,
  format, and rate; keep handlers bounded; deduplicate messages that mutate state.
- Handle close/error cleanup idempotently (including abnormal 1006 — never send 1006
  yourself). Use protocol sequence numbers for ordering/replay after reconnect. Shard
  high fan-out deterministically and define how clients discover their shard.

## Capacity and observability

- A hot object is one actor; more objects help only if the workload can partition.
  Bound in-flight work, queue depth, payload, and batch size; reject/defer excess before
  the runtime forces failure (admission control).
- Log operation ID, attempt, protocol/schema version, object identity, ownership token,
  failure category — no secrets or raw customer payloads. Track latency separately for
  storage, external I/O, transport, and queue wait; watch queue depth, oldest pending
  age, expired leases, alarm lag, socket count.

## Test scenarios (test the failures you claim to survive)

| Scenario | Required result |
| --- | --- |
| Same operation ID sent concurrently | One mutation; consistent stored result |
| Same ID reused with different payload | Conflict; no second mutation |
| Response lost after commit | Replay returns stored result |
| Instance reconstructed | Progress/membership rebuild from correct source |
| External effect succeeds before local completion | Provider dedup or reconciliation resolves it |
| Lease expires while old worker continues | Old completion can't overwrite new owner |
| Stale or duplicated alarm | No duplicate mutation, no abandoned running job |
| Later enqueue before earlier runs | Earliest wake-up preserved |
| Outage exceeds alarm retry budget | Visible failure + recovery path |
| Caller times out/cancels | Ambiguous/cancelled state reported accurately |
| Backfill interrupted/rerun | Atomic checkpoint, safe continuation |
| Caller/object version skew | Compatible protocol or explicit rejection |
| Class rename/routing change | Existing state stays reachable |
| Socket reconnect/abnormal close | Cleanup + resync correct |
| Hot object overload | Admission control works, no retry storm |

Cover worker↔object, object↔object, same-colo and cross-colo, deployment skew, and
mid-flight failures. Local runtime tests for storage invariants; staging for routing,
overload, and network behavior.
