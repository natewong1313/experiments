# Protocol schemas

Runtime schemas, inferred wire types, and AHP/ACP mappings for the agent host.
Consumers import TypeScript source directly. This package has no build step.

| Import                              | Contents                                                        |
| ----------------------------------- | --------------------------------------------------------------- |
| `@experiments/protocol-schemas/ahp` | AHP commands, state, actions, and shared JSON-RPC schemas       |
| `@experiments/protocol-schemas/acp` | The host's ACP subset, mappings, and shared JSON-RPC schemas    |
| `@experiments/protocol-schemas`     | Compatibility alias for `/ahp`, retained for existing consumers |

Use the explicit subpaths for new imports. Both re-export `src/jsonrpc.ts`.
Protocol-specific names stay within their own subpaths.

## ACP validation

Inbound ACP envelopes and modeled payloads allow and preserve additional fields.
Outbound envelopes and payloads reject undeclared fields. Agent-host validates at
the connection boundary and keeps its wire error codes and reporting policy.

The subset includes initialization with empty client capabilities, new/load
session requests with no MCP servers, text prompts, cancellation, and cancelled
permission responses. Initialization responses model the protocol version and
`loadSession` capability. Session responses model the conversation ID where
needed. Prompt responses model the stop reason.

Four session updates produce AHP actions:

- `agent_message_chunk` appends text to markdown parts.
- `agent_thought_chunk` appends text to reasoning parts.
- `tool_call` starts a tool and publishes its input and text results.
- `tool_call_update` updates an existing tool's text results and completion.

The host ignores unmodeled update variants and non-text content. Non-text output
blocks and tool diffs/terminals retain their payloads without modeling their fields.

Expand the subset when a consumer needs another field or operation. Unmodeled
areas include user message chunks, plans, available commands, mode/configuration
changes, session information, usage updates, non-text prompts, MCP configuration,
additional client capabilities, and permission approval.

## Mappings

| Function                                      | Result                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `ahpMessageToAcpPrompt(message)`              | Text blocks, or `{ ok: false, reason: "unsupported-content" }` for attachments |
| `acpUpdateToChatActions(turn, notification)`  | AHP actions using only the active turn's ID and response parts                 |
| `acpStopReasonToOutcome(stopReason)`          | `done`, `cancelled`, or `failed`, with message text and the raw stop reason    |
| `chatResponsePartId({ turnId, kind, index })` | A stable `${turnId}/${kind}/${index}` wire ID                                  |

Mapping functions return typed results and do not throw. Tool input that cannot
be serialized omits `toolInput` while retaining the tool actions. Unsupported
prompt content leaves the app to choose its rejection response.

`end_turn` completes a turn; `cancelled` cancels it. All other modeled stop reasons
produce one failure outcome. The package owns the failure message, and the app
publishes it using its existing error handling.

Adjacent chunks of the same kind reuse their response part. A kind change or an
intervening tool creates a part at the next response-part index. Preserve the ID
format when changing mappings because clients receive these IDs on the wire.

## Verification

The ACP SDK is exact-pinned to `0.26.0` as a development dependency. It supplies
the types for compile-time drift checks; package runtime code does not import it.
The checks compare each modeled field, nested content, optionality, nullability,
and modeled enum values. Unmodeled upstream fields do not require schema expansion.

```sh
pnpm --filter @experiments/protocol-schemas check-types
pnpm --filter @experiments/protocol-schemas lint
pnpm --filter @experiments/protocol-schemas test
pnpm --filter @experiments/agent-host test
```

Package tests cover mapping rules. The host integration tests exercise ACP
connections, Durable Object publication, and AHP snapshots, including reasoning,
tool results, stop reasons, attachment rejection, cancellation, and session loading.
