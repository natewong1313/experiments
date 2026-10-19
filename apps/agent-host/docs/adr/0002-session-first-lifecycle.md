# Create and dispose sessions at the session, then acknowledge at the host

ADR 0001 sent `createSession` and `disposeSession` through the host. The host wrote its catalogue row, published root events, and then called the session. Calls therefore went in both directions between the host and the sessions. A host crash between the catalogue write and the session call left a catalogue row without a session, and nothing recovered it. The host also had to know session internals, such as the default chat ID. We now send both requests from the router to the session. The session owns the existence of the session. The host catalogue is an index that the session keeps up to date. Before the session replies, it waits for the host to acknowledge each create and each dispose, so `listSessions` is still correct when the request resolves.

## Decisions

- **Calls go in one direction.** The router calls the session for `create` and `dispose`, and the session calls the host. The host never calls a session, and it has no session binding. The router calls the host only for `listSessions` and the root channel.
- **Host verbs fenced by the default chat.** `sessionCreated` inserts a catalogue row. It does nothing if the row exists with the same default chat. `summaryChanged` only updates an existing row with the same default chat and a newer revision. `sessionRemoved` deletes the row only if the default chat matches. A separate `orphanRemoved` verb deletes any row with the session ID. Each creation makes a new chat ID, so a stale message from an earlier incarnation of the same session ID never matches. A late summary cannot add a removed session again, so the host keeps no tombstones.
- **The session sends its host calls one at a time.** A dispose that starts while `sessionCreated` is in flight waits behind it. Each verb is idempotent, so the session can send it again after a failure or a timeout.
- **The session validates create.** It checks the channel, the provider, and the working directory, and it makes the chat ID. `AgentSession.getAgentInfo()` supplies the provider. The host keeps its own `getAgentInfo()` for the root snapshot.
- **Create is idempotent on the session ID.** A repeated create with the same provider and working directory waits for the create in progress, or succeeds if the session is ready. Different parameters fail with `SessionAlreadyExists`. Thus the router can retry `create` after a Durable Object reset.
- **Transient create failures resume.** The session schedules a `finishCreate` named alarm before it inserts the record. If a reset or a transient error interrupts creation, the request fails with a JSON-RPC internal error, and the alarm runs the create steps again. Each step is idempotent. The record counts the attempts, so a restart does not reset them. After the last attempt, the alarm disposes the session. An error response from the agent, or a catalogue entry of another session with the same ID, disposes the session at once. A validation error fails before the session stores anything.
- **Each creation has its own steps.** The steps of a creation run once at a time, keyed by the default chat. A create after a dispose does not wait for the steps of the disposed creation.
- **Dispose cannot be undone after it commits.** Dispose schedules `finishDispose` and then writes a `disposing` flag. From then on the session rejects `dispatch` and `subscribe`, and dispose only moves forward. The session cancels the agent, tells the routers, waits for `sessionRemoved`, and then deletes its storage. A `finishDispose` named alarm completes a dispose that stopped.
- **Dispose of an absent session cleans up the catalogue.** A session without a record sends `orphanRemoved`. The client gets success if the host removed a row, and `SessionNotFound` if it did not.
- **Restart recovery.** On restart, the session schedules the alarm for the state it finds: `finishDispose` while disposing, `finishCreate` while creating, and `syncCatalog` when the host has an older summary. The `syncedRevision` column records the revision whose summary the host has. A change that leaves the summary fields as they were moves it with the revision.

## Considered options

- **One upsert verb for create, update, and remove.** A late update could add a removed session again. To prevent this, the host would need tombstones and a counter that increases with each creation, which the session would keep after it deletes its storage. Separate verbs avoid both.
- **Undo a dispose when the host does not acknowledge it.** A failed acknowledgement does not show whether the host removed the row. An undo could leave a live session that the catalogue does not list, and nothing would repair it.
- **Fail closed on every create failure.** The client sees an error after a Durable Object reset in any case. With an idempotent create, a resumed session gives the same result as a successful retry, so we resume instead.

## Consequences

- The host cannot reject a create, so it cannot enforce a session quota. A quota needs a separate step before the create.
- A transient create failure returns an error to the client, but the session can still become ready later. A client can retry with the same session ID, or watch the root channel.
- A reset after the agent creates an ACP session, but before the session stores its ID, leaves that ACP session on the agent side.
- An agent that needs longer than the `finishCreate` attempt timeout to start can never become ready. `AgentSession.getLifecyclePolicy()` sets the timeout.
