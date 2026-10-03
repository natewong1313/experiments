# Pi agent

`@experiments/pi-agent` exports `PiAgent` and `PiAgentEnv`: a Durable Object
that composes `PiHarness` from `agents/harnesses/pi` with an ACP WebSocket
adapter and `@cloudflare/computer` workspace tools.

The backend stores sessions and files in SQLite. Its `read`, `write`, `edit`,
`delete`, `ls`, `find`, and `grep` tools use that durable filesystem. `exec` runs
JavaScript ES modules through the `LOADER` Dynamic Worker binding. It supports
`node:fs/promises`, `ws:git`, and relative workspace JavaScript modules; shell
commands and package installation are unavailable.

Declare the exported subclass with SQLite storage, `nodejs_compat`, an `AI`
binding, and a `LOADER` binding. The default Workers AI model is
`@cf/moonshotai/kimi-k2.7-code`. Override `getWorkspaceDirectory()`,
`getSessionDefaults()`, or `createModels()` to customize the backend.
Agents 0.25.0 and Pi 0.99.2 are pinned because these APIs are experimental.

ACP supports text prompts, streamed text and thoughts, tool notifications,
cancellation, and loading saved sessions. Each object permits one controlling
WebSocket. Reconnect and load its ACP session ID to replay text history and
continue. Sessions share their object's workspace. Existing container sessions
and files are not imported into the new Pi agent namespace.

The [agent-host](../agent-host/README.md) examples extend this Durable Object
and connect it to an `AgentHost` over ACP.

## Checks

```sh
pnpm --filter @experiments/pi-agent test
pnpm --filter @experiments/pi-agent check-types
pnpm --filter @experiments/pi-agent lint
```
