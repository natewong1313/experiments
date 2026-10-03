# Protocol schemas

Runtime schemas, inferred wire types, and AHP/ACP mappings for the agent host.
Consumers import TypeScript source directly. This package has no build step.

| Import                              | Contents                                                  |
| ----------------------------------- | --------------------------------------------------------- |
| `@experiments/protocol-schemas/ahp` | AHP commands, state, actions, and shared JSON-RPC schemas |
| `@experiments/protocol-schemas/acp` | Complete ACP v1 schemas, mappings, and session metadata   |
| `@experiments/protocol-schemas`     | Compatibility alias for `/ahp`                            |

Use explicit subpaths for new imports.

## ACP validation

The workspace catalog pins `@agentclientprotocol/sdk` to `1.7.0` for every consumer.
The generator reads the SDK's public `schema/schema.json` export and produces
validators for all 276 definitions. Each definition exports `NameSchema`,
`NameOutboundSchema`, and the inferred `Name` type.

Inbound validators preserve additional fields. Outbound validators reject
undeclared fields, except extension objects and dictionaries that the protocol
explicitly allows. `_meta` remains extensible in both directions. Malformed known
variants cannot pass through extensible union alternatives.

Compile-time checks compare generated payload types against the SDK in both
directions. The six RPC envelope definitions use method-specific parameter unions
from the JSON schema; the SDK types widen these envelope parameters, so they are
excluded from type comparison. Envelope validators are still generated and tested.
The package's runtime code does not import the SDK.

After changing the catalog version, regenerate and verify:

```sh
pnpm --filter @experiments/protocol-schemas generate:acp
pnpm --filter @experiments/protocol-schemas generate:acp:check
pnpm --filter @experiments/protocol-schemas check-types
```

## Session updates

Mappings handle every variant of the SDK's 19-member `SessionUpdate` union.
Exhaustive switches and a typed fixture record fail compilation when the SDK adds
a variant without a corresponding implementation.

Agent text and thought chunks produce markdown and reasoning parts. Images, audio,
resource links, and embedded resources produce content references. Tool updates
preserve inputs, outputs, progress, file diffs, and terminal references. ACP context
usage appears in `chat/usage` metadata, without treating context size as token usage.

Commands, modes, configuration, session information, usage, plans, compactions,
subagents, notices, and session messages update persisted session metadata under
`session._meta.acp[acpSessionId]`. The root session's title also updates the AHP title.
Transcript updates without a native AHP representation produce system notification
parts with the original notification in `part._meta.acp`. Child session output uses
this representation too, retaining its session ID and avoiding root tool ID collisions.
Updates outside an active turn publish session metadata and retain `lastUpdate`.

The host buffers setup updates until the conversation is bound. It accepts child
traffic after a subagent announcement and ignores unrelated sessions. Reloading
retains metadata updates while suppressing repeated transcript history.

## Mappings

| Function                                                                   | Result                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `ahpMessageToAcpPrompt(message)`                                           | Text blocks, or an unsupported-content result for attachments |
| `acpUpdateToChatActions(turn, notification, rootSessionId)`                | AHP chat actions for an active turn                           |
| `acpUpdateToSessionActions(session, notification, rootSessionId, hasTurn)` | Persisted ACP metadata and root title actions                 |
| `acpStopReasonToOutcome(stopReason)`                                       | A done, cancelled, or failed outcome                          |
| `chatResponsePartId({ turnId, kind, index })`                              | Stable wire IDs for response parts                            |

Adjacent chunks of the same kind and message ID reuse their part. A kind change,
message ID change, or intervening tool creates another part. Existing part IDs stay
unchanged when the agent omits message IDs.

Complete schemas include file access, terminals, authentication, permissions,
MCP, configuration operations, and elicitation. These validators do not implement
host controls for those operations. The host still accepts text prompts, passes an
empty MCP server list, and cancels permission requests.

## Verification

```sh
pnpm --filter @experiments/protocol-schemas test
pnpm --filter @experiments/protocol-schemas lint
pnpm --filter @experiments/agent-host check-types
pnpm --filter @experiments/agent-host test
pnpm run lint
pnpm run format
```

Tests check every published definition and every session-update variant, inbound
extensions, strict outbound validation, and metadata patch semantics. Workers
integration tests verify setup updates, subagent routing, session snapshots,
transcript payloads, cancellation, and session loading.
