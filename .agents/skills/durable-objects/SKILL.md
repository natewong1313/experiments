---
name: durable-objects
description: Architects, builds, debugs, and reviews Cloudflare Durable Objects code, covering object boundaries, lifecycle and concurrency tradeoffs, idempotency, durable effects, alarms, and testing. Use when creating or reviewing a Durable Object, choosing whether a problem needs one, designing sharding or coordination, handling restarts or hibernation, writing RPC callers or alarm handlers, or setting up wrangler config and migrations for DOs.
---

# Durable Objects

A Durable Object is a **restartable actor with a stable identity and private, strongly
consistent storage**. Its JS instance can vanish at any moment (eviction, hibernation,
deploy, crash) and be reconstructed later; only what you persist survives.

Your knowledge of DO APIs may be outdated. Prefer retrieval over pre-training:
[docs](https://developers.cloudflare.com/durable-objects/),
[best practices](https://developers.cloudflare.com/durable-objects/best-practices/),
[limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

## Is a DO even the right tool?

| Good fit | Bad fit |
| --- | --- |
| Coordination: rooms, games, collaborative docs | Stateless request handling (plain Worker) |
| Strong consistency over one entity: inventory, bookings | Max global distribution / multi-region active writes |
| Per-entity storage: tenant, account, workflow partition | Independent high-fanout requests (a hot DO is still one actor) |
| Persistent connections: WebSockets, real-time | Cron across many entities without per-entity state |

## Workflow

1. **Choose the object boundary first.** One object per entity that owns a useful
   invariant (room, account, inventory partition, workflow). Keep that entity's state,
   decisions, and deduplication inside one object. Cross-object invariants need an
   explicit coordinator or reconciliation protocol — an operation ID is unique within
   one object, not globally.
2. **Design for reconstruction.** Ask for each piece of state: "does this survive a
   restart?" Persist completion records, claims, memberships, workflow progress, and
   cleanup intent. In-memory state is only a cache — define how to rebuild it.
3. **Route and authorize explicitly.** Centralize name derivation, canonicalize IDs,
   authenticate before routing (an object name is not permission), persist
   `newUniqueId()` mappings, and treat name-format changes as data migrations.
4. **Write crash-safe mutations.** Idempotency keys, atomic transaction boundaries,
   durable effects — follow the patterns in [architecture.md](./architecture.md).
5. **Test the failures you claim to survive.** See the scenario table in
   [architecture.md](./architecture.md).

## Core rules

1. **SQLite-backed storage for new classes** (`new_sqlite_classes` in migrations). It
   supports both SQL and KV; legacy KV classes do not support `storage.sql`.
2. **Synchronous code runs atomically; awaits open the gates.** Storage input gates and
   output gates make many storage-only read-modify-write sequences safe, but *not*
   sequences spanning an `await` on external I/O. Recheck assumptions after awaits;
   consume SQL cursors before awaiting.
3. **`blockConcurrencyWhile()` is for bounded init only** (schema, local config) — never
   request processing or external calls. A thrown error or 30s timeout resets the object.
4. **Persist first, then act.** A timer or background promise is not a durable job.
5. **One alarm slot per object** — `setAlarm()` replaces the existing schedule; alarms
   are at-least-once, can run late, and retry ~6 times. Never schedule unconditionally
   in the constructor.
6. **Return structured errors** (`{ok, error:{code, retryable}}`), not custom classes
   that break across RPC. Retry only `.retryable === true`; never retry
   `.overloaded === true`. Bound retries with attempts + deadline + backoff.
7. **External effects are never atomic with local storage.** Persist an outbox/operation
   record first, act outside the transaction with a downstream idempotency key,
   record completion conditionally afterward.

## Quick start

```typescript
import { DurableOrder } from "./order-do"; // class with idempotent RPC, see architecture.md

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // authorize first, then route deterministically
    const stub = env.ORDERS.getByName(canonicalRoomId(url.pathname));
    const result = await stub.createOrder({ operationId, orderId }); // idempotent
    return result.ok ? Response.json(result.value) : jsonError(result.error);
  },
};
```

```jsonc
// wrangler.jsonc — bindings + SQLite migration tag
{
  "durable_objects": { "bindings": [{ "name": "ORDERS", "class_name": "OrderDO" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["OrderDO"] }],
}
```

## References

- [architecture.md](./architecture.md) — deep patterns: idempotency records, outbox and
  leases, alarm multiplexing, resumable backfills, hibernation, capacity, test scenarios.
- [rules.md](./rules.md) — doc lookup table for API-level questions (storage, gates,
  routing, placement, lifecycle).
- [testing.md](./testing.md) — read before configuring a DO test suite.
- [workers.md](./workers.md) — Workers handlers, types, wrangler config, observability.

Anti-patterns: one global DO for everything; `blockConcurrencyWhile()` per request;
critical state only in memory; `await` between related storage writes; unbounded RPC
polling; retrying unknown or `.overloaded` errors; alarm scheduling in the constructor.
