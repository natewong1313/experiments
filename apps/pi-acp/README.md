# Pi ACP

Translation layer that takes incoming ACP requests and converts them to PiHarness calls. If you have Pi running in a durable object, this lets you take in ACP over websockets and have everything just work.

## Usage

```ts
import { DurableObject } from "cloudflare:workers";
import { connectAcp } from "@experiments/pi-acp";
import { PiHarness } from "agents/harness/pi";

export class MyAgent extends DurableObject<Env> {
  readonly harness = new PiHarness({/* your pi harness setup */});

  override async fetch(request: Request): Promise<Response> {
    // ... require a WebSocket upgrade, accept the socket ...
    connectAcp({ socket: server, harness: this.harness, cwd: "/workspace" });

    return new Response(null, { status: 101, webSocket: client });
  }
}
```

## Reattaching to a prompt

A `session/prompt` with `_meta["agent-host/operationId"]` runs as a Pi operation with that
ID, so Pi runs it once. If a connection closes during the prompt, Pi keeps running it. A later
prompt with the same ID, on any connection, reattaches to it.

Every prompt with an operation ID starts with a replay: all the text of the operation so far,
as `agent_message_chunk` updates with `_meta["agent-host/replay"]: { start, end }`. `start`
marks the first chunk and `end` the last. A new operation replays one empty chunk. Each chunk
holds at most 64 Ki UTF-16 code units, so it fits in one WebSocket frame. The client replaces
the text it has for the operation with the replay, then treats later chunks as new text.
`initialize` advertises the extension as `agentCapabilities._meta["agent-host/operationId"]: true`.

## Disclaimer

This is mostly a proof of concept to make examples work. This hasn't been fully fleshed out yet and should not be used in production.
