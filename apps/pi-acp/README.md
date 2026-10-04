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

## Disclaimer

This is mostly a proof of concept to make examples work. This hasn't been fully fleshed out yet and should not be used in production.
