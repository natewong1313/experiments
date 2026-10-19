# Route client connections through a per-connection router

The host Durable Object owned every client WebSocket and relayed every session update, including each streamed `chat/delta`. One object therefore limited the throughput of all sessions in a host, and an eviction or out-of-memory failure of that object disconnected every client. We put an `AgentHostConnectionRouter` Durable Object in front of each WebSocket. The router sends catalogue requests to the host and session requests directly to the session. Sessions push their actions directly to the routers that subscribe to them. The host owns only the session catalogue and the root channel.

## Decisions

- **One router per connection.** The Worker names each router `<hostId>/<random UUID>`. The AHP `clientId` arrives in `initialize`, after the upgrade, so it cannot select the object.
- **`serverSeq` per connection.** Each router counts its own `serverSeq`. It stamps every action it forwards, the `fromSeq` of every snapshot, and every rejection. A client only sees the sequence of its own connection, so the AHP ordering rules still hold. A host-wide counter would bring the bottleneck back.
- **Chat URIs contain their session.** Chat URIs have the form `ahp-chat:/<sessionId>/<chatId>`, which AHP permits. The router finds the session of a chat without a lookup. `moveChat` would break this, and we do not support it.
- **Senders store their subscribers.** Sessions store the routers that subscribe to their channels, and the host stores the routers that subscribe to the root channel. Both use `RouterFanout`, which keeps the `subscriber_routers` and `subscriber_channels` tables in the database of the sender. Each sender records the last revision it delivered to each router.
- **Best-effort, ordered delivery without history.** Each push carries the previous revision `after` and the consecutive revisions after it. A push with no revisions after `after` tells the router the current revision of the sender. Each router stores the last revision that it received from each sender in its `senders` table, and ignores revisions that it already has. A router that finds a gap closes its WebSocket, and the client initializes again. Senders keep no history of actions, so they cannot fill a gap. A router answers each push with `{ subscribed: string[] }`, the channels of that sender that it still subscribes to. The sender removes the other channels that existed when it sent the push. A sender that cannot reach a router after its retries removes that router.
- **Crash recovery by alarm.** The host and each session schedule a `flushSubscribers` named alarm while pushes are in flight. After a restart, a sender schedules the alarm at once if a router lags. The alarm tells each lagging router about the gap.
- **Root revision with the catalogue write.** The host stores each catalogue change and the new root revision in one transaction. After a crash, each catalogue change that a router did not receive has a root revision, so the alarm finds the gap.
- **Host-first create and dispose.** Superseded by [ADR 0002](0002-session-first-lifecycle.md). `createSession` and `disposeSession` went through the host, so `listSessions` was correct when they resolved.
- **Summary-only catalogue sync.** A session updates the host only when a summary field other than `modifiedAt` changes. A `syncCatalogue` named alarm from the `durability` library sends the latest summary. The host ignores old revisions.
- **No storage for unknown sessions.** A session object runs its migrations only when the session is created or when it finds existing tables. A request for an unknown session ID leaves no stored object.

## Considered options

- **A durable queue for each subscriber** (`durability` fanout or operations). We rejected it. It writes storage for each delta and each subscriber, and it does not keep the order. Also, a router without a socket has no reader.
- **A short history of actions in each session.** It lets a router fill a gap without a reconnect, and it is what AHP `reconnect` needs. We defer it until we support `reconnect`.
- **Session-first create and dispose.** We rejected it because `listSessions` could miss a session after `createSession` resolves. [ADR 0002](0002-session-first-lifecycle.md) adopts it with a host acknowledgement before the reply.

## Consequences

- The host still sends each root channel message to every router that subscribes to the root channel. This cost grows with the number of connected clients. A layer of fan-out objects can remove it later.
- `reconnect` needs a way to map a `clientId` and its `serverSeq` to the revisions of each sender, because routers delete their state when the connection closes.
