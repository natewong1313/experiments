# Harness container

Runs pi inside a Cloudflare Container and makes it accessible via ACP over websocket.

This intentionally has a bunch of flaws and isn't designed to be for production, moreso just for building out and verifying the AHP host implementation.

```text
ACP client → Worker → Durable Object → container bridge → pi-acp → pi
```

Connect to `/agents/<agent-id>/acp`. IDs contain 1–64 letters, digits, underscores, or hyphens. Each ID selects its own Durable Object, container, and initially empty `/workspace`. Each container allows one controlling WebSocket. A second connection receives HTTP 409. Each WebSocket text frame carries one complete JSON-RPC message; the bridge converts frames to and from the adapter's newline-delimited stdio protocol.

The image installs `@earendil-works/pi-coding-agent@0.99.2` and `pi-acp@0.0.33`. The smoke client uses ACP SDK `0.26.0`, matching the adapter. Pi starts with provider `cloudflare-workers-ai` and model `@cf/moonshotai/kimi-k2.6`. `CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID` are passed from Worker secrets into the container at runtime. The Docker build context excludes the app's `.env`.

## Use from a host Durable Object

This app is intended to run agents for a host DO, which owns the ACP client connection. Give the host a `HARNESS_CONTAINER` namespace binding to `HarnessContainer`, then connect directly through its stub. If the host lives in another Worker, configure the binding's `script_name` as `harness-container`. The public Worker route is not needed for this connection.

With `@agentclientprotocol/sdk@0.26.0`, the flow inside the host DO is:

```ts
import { ClientSideConnection, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

const agent = this.env.HARNESS_CONTAINER.getByName(agentId);
const response = await agent.fetch("https://agent/acp", {
  headers: { Upgrade: "websocket" },
});
const socket = response.webSocket;
if (!socket) throw new Error(`Agent connection failed: ${response.status}`);

const connection = new ClientSideConnection(
  () => ({
    async sessionUpdate(notification) {
      // Persist or forward updates to the host's clients.
    },
    async requestPermission() {
      return { outcome: { outcome: "cancelled" } };
    },
  }),
  websocketToAcpStream(socket),
);
socket.accept();

await connection.initialize({
  protocolVersion: PROTOCOL_VERSION,
  clientCapabilities: {},
});
const session = await connection.newSession({
  cwd: "/workspace",
  mcpServers: [],
});
const result = await connection.prompt({
  sessionId: session.sessionId,
  prompt: [{ type: "text", text: "Create a hello-world app" }],
});
```

`websocketToAcpStream` is a helper the host must supply, not an SDK export. It returns the SDK's `Stream`: a `ReadableStream<AnyMessage>` that parses incoming JSON text frames and a `WritableStream<AnyMessage>` that sends `JSON.stringify(message)`. It should handle socket errors and closure, and close the socket when the stream is cancelled or aborted. Use Cloudflare's native WebSocket API; the helper in `scripts/websocket-stream.ts` uses Node's `ws` and is only for the smoke client and tests.

Keep the connection open for additional prompts. Updates and reverse permission requests arrive while `prompt()` is pending; the SDK handles request IDs and response matching. Closing the socket stops the agent. Only one host connection can control an agent ID at a time. Outbound WebSockets do not support DO hibernation. An eventual AHP host would translate its operations into these ACP calls and forward the updates to its clients.

## Run locally

Docker must be installed and its daemon accessible. From the repository root:

```sh
pnpm install
pnpm --filter @experiments/harness-container cf-typegen
pnpm --filter @experiments/harness-container dev
```

Wrangler reads the existing `apps/harness-container/.env`. Keep the two variable names in `.env.example`; fill their values only in `.env`.

In another terminal, initialize ACP and create a session without calling the model:

```sh
pnpm --filter @experiments/harness-container smoke
```

Send a prompt through the SDK smoke client:

```sh
pnpm --filter @experiments/harness-container smoke \
  ws://localhost:8787/agents/example/acp 'Reply with exactly PONG.'
```

The smoke client prints text updates and the prompt's stop reason. It does not advertise client filesystem or terminal capabilities, and cancels any permission request it receives. Agent file operations and shell commands execute inside the container.

### Run the bridge without Docker

Install the same pinned pi packages globally:

```sh
npm install --global --ignore-scripts @earendil-works/pi-coding-agent@0.99.2 pi-acp@0.0.33
```

From the app directory:

```sh
WORKSPACE_DIR=/tmp/harness-workspace PI_CODING_AGENT_DIR=/tmp/harness-pi \
  pnpm dev:bridge
WORKSPACE_DIR=/tmp/harness-workspace pnpm smoke ws://localhost:8080/acp
```

This launches one bridge directly on the local machine. Named routing and separate containers are provided by the Worker version above.

## Deployment

The `deploy` script builds the container and deploys the Worker. Local `.env` values are not automatically uploaded as Worker secrets. Configure both provider credentials as Worker secrets before connecting to a deployed container. Wrangler deployment authentication is separate from pi's Workers AI credentials.

## Lifecycle and scope

Disconnecting stops the adapter and signals its process group. A replacement controller is accepted after the adapter exits. Connected clients must initialize ACP again and create a new session; this app provides no reconnect replay. Container disk and conversations are disposable across restarts. Idle containers stop after ten minutes; ongoing proxied connections keep the Durable Object active.

Endpoint authentication is omitted for this prototype. A future AHP host can own the ACP connection and provide shared sessions, sequencing, permissions, and replay above this app. There is no AHP host implementation here.

The selected adapter does not delegate filesystem or terminal operations to clients. Its supplied ACP MCP server configuration is not connected to pi. The bridge transports reverse requests and notifications without implementing those features itself.

## Checks

```sh
pnpm --filter @experiments/harness-container check-types
pnpm --filter @experiments/harness-container test
pnpm run lint
pnpm --filter @experiments/harness-container build
```

Tests check framing, Unicode, limits, streaming while prompts are pending, reverse requests, cancellation, exclusive ownership, and disconnect cleanup. The socket tests explicitly skip when local listeners are forbidden. `build` checks Worker packaging and the Docker build. A Worker-only packaging check can use `wrangler deploy --dry-run --containers-rollout=none`, which does not build or validate the image.

Sources: [AHP and ACP composition](https://microsoft.github.io/agent-host-protocol/guide/ahp-and-acp.html), [ACP SDK](https://github.com/agentclientprotocol/typescript-sdk), [pi-acp adapter](https://github.com/svkozak/pi-acp), [pi providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md), [Cloudflare container WebSockets](https://developers.cloudflare.com/containers/examples/websocket/).
