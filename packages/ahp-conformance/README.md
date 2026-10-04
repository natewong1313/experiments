# AHP host conformance suite

The suite targets AHP 0.9.0 and includes both external-host conformance cases and local WebSocket harness regressions. It uses `@microsoft/agent-host-protocol@0.9.0` for version data, typed requests, subscriptions, and WebSocket transport. A raw JSON-RPC connection handles invalid requests and action-envelope checks that the typed client cannot express.

Run the suite against any accessible AHP WebSocket endpoint:

```sh
pnpm install
AHP_URL='ws://127.0.0.1:9187' pnpm test:ahp
```

Supply the full URL, including a token query parameter when the host requires one. The suite does not start a host or create its fixtures. AHP permits transports other than WebSocket; this runner targets WebSocket hosts.

Run the harness regressions without an external host:

```sh
pnpm --filter @experiments/ahp-conformance run test:harness
pnpm --filter @experiments/ahp-conformance run check-types
```

These regressions use real ephemeral localhost WebSocket peers. They cover action arrival between waits, correlation and interleaving, malformed traffic, disconnects, transcript overflow, default-chat selection, and shutdown after scenario failure. They do not invoke an agent backend.

## Fixtures

The core tests need only `AHP_URL`. Additional URI variables enable channel-specific checks:

| Variable                  | Fixture                                                                                                     | Tests enabled                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `AHP_SESSION_URI`         | An existing, ready session with a default chat                                                              | Session and chat snapshots, catalogue consistency, duplicate-session and history-cursor errors                        |
| `AHP_RETAINED_TURN_IDS`   | A nonempty JSON array of the default chat's complete, ordered retained turn IDs; requires `AHP_SESSION_URI` | Exact retained-history completeness without a requested window                                                        |
| `AHP_FILE_URI`            | A readable file                                                                                             | Read and resolve                                                                                                      |
| `AHP_DIRECTORY_URI`       | A browsable directory                                                                                       | List, resolve, missing child                                                                                          |
| `AHP_TERMINAL_URI`        | An existing terminal                                                                                        | Terminal state and root catalogue                                                                                     |
| `AHP_WATCH_DIRECTORY_URI` | A directory where the host permits watchers                                                                 | Watch creation, subscription, and descriptor state                                                                    |
| `AHP_CHANGESET_URI`       | An expanded, subscribable changeset URI                                                                     | Changeset lifecycle and file edits                                                                                    |
| `AHP_MCP_URI`             | A ready MCP side channel advertised by a session customization                                              | Rejection of an unadvertised MCP method                                                                               |
| `AHP_WRITABLE_FILE_URI`   | A disposable file                                                                                           | Write and restore, with `AHP_TEST_MUTATIONS=1`                                                                        |
| `AHP_TEST_MUTATIONS=1`    | Consent to change the disposable fixtures                                                                   | Session action validation, title echo, cross-client state and missed-title reconnect recovery, file write and restore |

Mutation tests attempt to restore the original title or file content even after assertion failure, but an interrupted process can leave a fixture changed. Title scenarios preserve both the scenario and cleanup errors if both fail. Files run serially because tests share supplied mutable fixtures; this does not isolate them from another suite process or other clients. Use disposable fixtures. No test sends an agent prompt, starts an automation, or intentionally executes a terminal command.

Automation and telemetry tests run when `initialize` advertises those capabilities. Vitest marks tests that need absent capabilities or unset fixture variables as skipped. A passing run with many skips covers fewer protocol areas; inspect the pass and skip totals.

When `AHP_RETAINED_TURN_IDS` is absent, only the exact history-completeness case is skipped. A supplied but invalid declaration fails setup rather than silently skipping. For example:

```sh
AHP_URL='ws://127.0.0.1:9187' \
AHP_SESSION_URI='ahp-session:/disposable-fixture' \
AHP_RETAINED_TURN_IDS='["first-retained-turn","second-retained-turn"]' \
pnpm test:ahp
```

## Protocol slices

| File                     | Coverage                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `lifecycle.test.ts`      | Pre-initialize behavior, version selection and errors, initialization snapshots, ping                                                  |
| `subscriptions.test.ts`  | Subscribe, unsubscribe, multiple clients, actual socket close, recovery of a known missed title mutation through replay or snapshots   |
| `root.test.ts`           | Agent state and session catalogue pagination                                                                                           |
| `session.test.ts`        | Session state, chat catalogue, client action validation and echo                                                                       |
| `chat.test.ts`           | Default-chat summary consistency, working directories, fixture-declared retained-history completeness                                  |
| `resources.test.ts`      | Read, list, resolve, missing resource, optional write and restore                                                                      |
| `terminal.test.ts`       | Terminal state and root catalogue consistency                                                                                          |
| `automation.test.ts`     | Advertised automation catalogue                                                                                                        |
| `telemetry.test.ts`      | Advertised OTLP channels                                                                                                               |
| `resource-watch.test.ts` | Watch creation, subscription, and state                                                                                                |
| `changeset.test.ts`      | Changeset state and file edits                                                                                                         |
| `annotations.test.ts`    | Advertised session annotations                                                                                                         |
| `mcp.test.ts`            | MCP side-channel method restrictions                                                                                                   |
| `errors.test.ts`         | JSON-RPC errors, request correlation, provider and session errors, invalid history cursor                                              |
| `raw.test.ts`            | Local transport regressions: buffered/correlated actions, JSON-RPC demultiplexing, invalid frames, socket failure and bounded evidence |
| `client.test.ts`         | Local typed-client regressions: declared default-chat selection, invalid catalogue membership, fallback and failure cleanup            |

The suite checks requirements that a URL client can observe. It does not prove every AHP 0.9.0 rule: full MCP relay, authentication challenges, automation execution, tool confirmation, and streaming turns need dedicated fixtures and, in some cases, a controllable agent. Watch and MCP cases cover only the behavior listed above.

## Raw observation contract

`AhpConnection` installs a connection-lifetime reader before opening completes. `events` exposes immutable received-message evidence, including replies, actions, other notifications, reverse requests and invalid frames. Unsupported reverse requests receive `MethodNotFound`; the harness does not pretend to implement resource services.

Capture `connection.checkpoint` before the operation under test and pass it as the required `after` option to `waitForAction(channel, type, { after, predicate })`. The cursor is a local receive index, not `serverSeq`. Buffered matches after that cursor remain available; predicates can correlate origin/client sequence, turn and part identities.

Malformed traffic, unsupported binary frames, socket failure and overflow fail pending and subsequent operations immediately. The transcript limit is 10,000 received messages; overflow fails rather than silently evicting evidence. Evidence remains readable after close. This is a message-count bound, not a byte-size bound.

When upgrading, update the package version and lockfile, then review the cases against that version's specification. `PROTOCOL_VERSION` comes from the installed package rather than a duplicated test constant.
