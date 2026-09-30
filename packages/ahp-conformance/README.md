# AHP host conformance suite

The fourteen Vitest files contain 99 cases for AHP 0.9.0. The package uses `@microsoft/agent-host-protocol@0.9.0` for version data, typed requests, subscriptions, and WebSocket transport. A raw JSON-RPC connection is used for invalid requests and action-envelope checks that the typed client cannot express.

Run the suite against any accessible AHP WebSocket endpoint:

```sh
pnpm install
AHP_URL='ws://127.0.0.1:9187' pnpm test:ahp
```

Supply the full URL, including a token query parameter when the host requires one. The suite does not start a host or create its fixtures. AHP permits transports other than WebSocket; this runner targets WebSocket hosts.

## Fixtures

The core tests need only `AHP_URL`. Additional URI variables enable channel-specific checks:

| Variable | Fixture | Tests enabled |
| --- | --- | --- |
| `AHP_SESSION_URI` | An existing, ready session with a default chat | Session and chat snapshots, catalogue consistency, duplicate-session and history-cursor errors |
| `AHP_FILE_URI` | A readable file | Read and resolve |
| `AHP_DIRECTORY_URI` | A browsable directory | List, resolve, missing child |
| `AHP_TERMINAL_URI` | An existing terminal | Terminal state and root catalogue |
| `AHP_WATCH_DIRECTORY_URI` | A directory where the host permits watchers | Watch creation, subscription, and descriptor state |
| `AHP_CHANGESET_URI` | An expanded, subscribable changeset URI | Changeset lifecycle and file edits |
| `AHP_MCP_URI` | A ready MCP side channel advertised by a session customization | Rejection of an unadvertised MCP method |
| `AHP_WRITABLE_FILE_URI` | A disposable file | Write and restore, with `AHP_TEST_MUTATIONS=1` |
| `AHP_TEST_MUTATIONS=1` | Consent to change the disposable fixtures | Session action validation, title echo and cross-client state, file write and restore |

The mutation tests restore the original title or file content in `finally`, but an interrupted process can leave a fixture changed. Use disposable fixtures. No test sends an agent prompt, starts an automation, or intentionally executes a terminal command.

Automation and telemetry tests run when `initialize` advertises those capabilities. Vitest marks tests that need absent capabilities or unset fixture variables as skipped. A passing run with many skips covers fewer protocol areas; inspect the pass and skip totals.

## Protocol slices

| File | Coverage |
| --- | --- |
| `lifecycle.test.ts` | Pre-initialize behavior, version selection and errors, initialization snapshots, ping |
| `subscriptions.test.ts` | Subscribe, unsubscribe, multiple clients, reconnect replay and snapshots |
| `root.test.ts` | Agent state and session catalogue pagination |
| `session.test.ts` | Session state, chat catalogue, client action validation and echo |
| `chat.test.ts` | Chat state, retained turns, cursors, session summary consistency |
| `resources.test.ts` | Read, list, resolve, missing resource, optional write and restore |
| `terminal.test.ts` | Terminal state and root catalogue consistency |
| `automation.test.ts` | Advertised automation catalogue |
| `telemetry.test.ts` | Advertised OTLP channels |
| `resource-watch.test.ts` | Watch creation, subscription, and state |
| `changeset.test.ts` | Changeset state and file edits |
| `annotations.test.ts` | Advertised session annotations |
| `mcp.test.ts` | MCP side-channel method restrictions |
| `errors.test.ts` | JSON-RPC errors, request correlation, provider and session errors, invalid history cursor |

The suite checks requirements that a URL client can observe. It does not prove every AHP 0.9.0 rule: full MCP relay, authentication challenges, automation execution, tool confirmation, and streaming turns need dedicated fixtures and, in some cases, a controllable agent. Watch and MCP cases cover only the behavior listed above.

When upgrading, update the package version and lockfile, then review the cases against that version's specification. `PROTOCOL_VERSION` comes from the installed package rather than a duplicated test constant.
