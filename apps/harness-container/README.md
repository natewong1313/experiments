# Harness container

`@experiments/harness-container` exports a Durable Object class that runs pi in a
Cloudflare Container and forwards ACP WebSockets to its bridge. Consumers import
and extend the class in their own Worker. The package does not deploy a Worker
or choose public routes.

```ts
import { HarnessContainer } from "@experiments/harness-container";
import type { HarnessContainerEnv } from "@experiments/harness-container";

interface Env extends HarnessContainerEnv {
  WORKSPACE_DIR: string;
  AGENTS: DurableObjectNamespace<MyAgent>;
}

export class MyAgent extends HarnessContainer<Env> {
  protected override getContainerEnv(): Record<string, string> {
    return {
      ...super.getContainerEnv(),
      WORKSPACE_DIR: this.env.WORKSPACE_DIR,
    };
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.AGENTS.getByName("example").fetch(request);
  },
} satisfies ExportedHandler<Env>;
```

`HarnessContainerEnv` requires `CLOUDFLARE_API_KEY` and
`CLOUDFLARE_ACCOUNT_ID`. The default `getContainerEnv()` validates these
credentials and passes them to pi. Override it to add container environment
variables. Other Worker bindings and secrets stay in the Worker.

Subclasses can override these protected properties:

| Property              | Default   | Purpose                                      |
| --------------------- | --------- | -------------------------------------------- |
| `port`                | `8080`    | Container bridge port                        |
| `inactivityTimeoutMs` | `600_000` | How long an inactive container stays running |
| `readinessTimeoutMs`  | `30_000`  | Startup health check deadline                |
| `pollIntervalMs`      | `200`     | Delay between startup health checks          |

`fetch()` starts the container with internet access, waits for `/health`, then
forwards the request to `/acp`. It reapplies the inactivity timeout on the first
request after a Durable Object restart. Failed startup or forwarding returns
HTTP 503, and the next request retries.

## Self-hosting example

[example/](./example/README.md) contains a separate workspace package that
imports and extends the class, exports a Worker, and configures Wrangler,
container image builds, bindings, SQLite storage, and provider secrets.

From the repository root:

```sh
pnpm install
cp apps/harness-container/example/.env.example apps/harness-container/example/.env
# Fill in the credentials in example/.env.
pnpm --filter @experiments/harness-container-example cf-typegen
pnpm --filter @experiments/harness-container-example dev
```

The package exports TypeScript source, following this repository's shared
package convention. Workers bundlers such as Wrangler consume it directly.
It remains a private workspace package.

## Connect from a host Durable Object

Give the host a namespace binding to the consumer's exported subclass. A host
in the same Worker can use that binding directly; a host in another Worker must
also set `script_name` to the consumer's Worker name.

```ts
const response = await this.env.AGENTS.getByName(agentId).fetch(
  "https://agent/acp",
  { headers: { Upgrade: "websocket" } },
);
const socket = response.webSocket;
if (!socket) throw new Error(`Agent connection failed: ${response.status}`);
socket.accept();
```

Use an ACP client to initialize the connection, create a session with
`cwd: "/workspace"`, and send prompts. Each WebSocket text frame contains one
complete JSON-RPC message. A Workers ACP stream adapter is implemented in
[agent-host](../agent-host/src/agent/acp.ts).

Each container allows one controlling WebSocket. A second connection receives
HTTP 409. Closing the socket stops the adapter and signals its process group.
A replacement controller is accepted after the adapter exits. Initialize ACP
again when reconnecting. Outbound WebSockets do not support DO hibernation.

## Container runtime

The shared [Dockerfile](./Dockerfile) installs
`@earendil-works/pi-coding-agent@0.99.2` and `pi-acp@0.0.33`.
Pi uses provider `cloudflare-workers-ai` and model
`@cf/moonshotai/kimi-k2.6`. Worker secrets enter the container at runtime;
the Docker build context excludes `.env` files.

To run the bridge without Docker, install the pinned pi packages globally:

```sh
npm install --global --ignore-scripts @earendil-works/pi-coding-agent@0.99.2 pi-acp@0.0.33
```

Keep provider credentials in `apps/harness-container/.env`, then run from that
directory:

```sh
WORKSPACE_DIR=/tmp/harness-workspace PI_CODING_AGENT_DIR=/tmp/harness-pi \
  pnpm dev:bridge
```

Connect an ACP client to `ws://localhost:8080/acp`. This runs a single bridge;
named routing and separate containers belong to the consumer Worker.

Container disk and conversations are disposable across restarts. The adapter
does not delegate filesystem or terminal operations to clients, and its ACP
MCP server configuration is not connected to pi. This remains a prototype.

## Logs

The Worker logs container startup, readiness, forwarded response statuses, and
failures with a `containerId`. The bridge writes JSON lines to stderr with a
timestamp and a `connectionId` for each controlling WebSocket. It logs agent
process startup and exit, disconnects, protocol errors, and ACP methods and
response IDs. ACP payloads and streaming `session/update` notifications are
omitted. Pi's stderr appears as `agent_stderr` events.

During local development, Worker logs appear in the Wrangler terminal and bridge
logs appear in the container output or the `dev:bridge` terminal.

## Checks

```sh
pnpm --filter @experiments/harness-container check-types
pnpm --filter @experiments/harness-container-example check-types
pnpm --filter @experiments/harness-container-example build
pnpm run lint
pnpm run format
```

The example's `build` checks Worker packaging and the Docker image build.
Its [runtime smoke instructions](./example/README.md#run-locally) exercise ACP
initialization, session creation, and a real Workers AI prompt.

Sources: [Cloudflare container API](https://developers.cloudflare.com/containers/api/durable-object-container/),
[Wrangler container configuration](https://developers.cloudflare.com/containers/configuration/wrangler/),
[ACP SDK](https://github.com/agentclientprotocol/typescript-sdk),
[pi-acp adapter](https://github.com/svkozak/pi-acp).
