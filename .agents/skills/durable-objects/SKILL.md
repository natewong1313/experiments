---
name: durable-objects
description: Designs, implements, debugs, and reviews Cloudflare Durable Objects. Use when working on Durable Object boundaries, routing, storage, RPC retries, durable jobs, alarms, migrations, hibernatable WebSockets, or capacity.
---

# Durable Objects

Treat each object as a restartable actor. Its durable state must explain how to
continue after reconstruction or replay.

## Workflow

1. Trace the affected invariant through callers, object identity, storage, and
   external effects. Identify the storage backend and deployment configuration.
   Finish when every affected entry point and state owner is accounted for.
2. Read the guide sections for each affected concern from the table below. Use
   [lifecycle and initialization](references/durable-object-new.md#lifecycle-and-initialization)
   and [concurrency and transactions](references/durable-object-new.md#concurrency-and-transactions)
   to check reconstruction and interleaving assumptions. Finish when each
   correctness-critical value has a persistence or reconstruction strategy and
   each mutation has an explicit atomicity boundary.
   Before adding retries, durable jobs, alarm multiplexing, fanout, or adaptive
   routing, read [library guidance](references/libraries.md) for the installed
   helpers and their delivery, deduplication, and migration contracts.
3. Implement or review each transition with its replay and recovery behavior.
   For example, a retryable order RPC must bind its operation ID to the request,
   commit the order and result together, and return that result after response
   loss. Finish when every external effect, retry, and interrupted operation has
   an owner, a bounded execution budget, and a recovery path.
4. Select applicable scenarios from
   [capacity, observability, and testing](references/durable-object-new.md#capacity-observability-and-testing).
   Verify each affected failure boundary with a test or concrete evidence. For a
   review, identify the path that violates the required result. Finish when each
   applicable scenario has a result or an explicit verification gap. Distinguish
   local runtime evidence from deployment and network behavior requiring staging.

## Guide sections

The [local guide](references/durable-object-new.md) consolidates the previous
implementation, infrastructure, and edge-case guides. Load the sections relevant
to the task rather than all examples and historical evidence.

| When the task involves | Read |
| --- | --- |
| Object boundaries, authorization, names, namespaces, class changes, or cross-object invariants | [Identity and routing](references/durable-object-new.md#identity-and-routing) |
| Retried mutations, duplicate delivery, operation-key reuse, or result retention | [RPC and idempotency](references/durable-object-new.md#rpc-and-idempotency) |
| Transport failures, overload, timeouts, or cancellation | [Retries, deadlines, and cancellation](references/durable-object-new.md#retries-deadlines-and-cancellation) |
| HTTP, queues, other objects, outboxes, claims, leases, or checkpoints | [External effects and recoverable work](references/durable-object-new.md#external-effects-and-recoverable-work) |
| Scheduled work, alarm multiplexing, stale wake-ups, or abandoned running jobs | [Alarms and logical timers](references/durable-object-new.md#alarms-and-logical-timers) |
| SQL schema changes, backfills, storage conversion, or recovery | [Schema migrations and bulk work](references/durable-object-new.md#schema-migrations-and-bulk-work) |
| Socket callbacks, attachments, reconnects, or fan-out | [WebSockets and hibernation](references/durable-object-new.md#websockets-and-hibernation) |
| Hot objects, sharding, admission limits, metrics, or failure tests | [Capacity, observability, and testing](references/durable-object-new.md#capacity-observability-and-testing) |
| Repeated coordination behavior being extracted into a helper | [Shared infrastructure](references/durable-object-new.md#shared-infrastructure) |
| A claim based on private APIs or internal runtime limits | [Source notes and implementation evidence](references/durable-object-new.md#source-notes-and-implementation-evidence) |

The guide records its documentation check date. Verify API behavior, limits, and
deployment semantics against current official Cloudflare documentation before
relying on them. Treat internal implementation observations as evidence to
investigate, not public platform guarantees. Check local dependencies and helper
contracts before choosing a retry utility.
