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

Every prompt with an operation ID starts with a replay of the output of the operation so far:
its text, thinking, and tool call updates, in order, each with
`_meta["agent-host/replay"]: { start, end }`. `start` marks the first update and `end` the
last. A new operation replays one empty `agent_message_chunk`. The client replaces the output
it has for the operation with the replay, then treats later updates as new output.
`initialize` advertises the extension as
`agentCapabilities._meta["agent-host/operationId"]: true`.

The replay has the order that the live updates have. Each assistant message gives its text
and thinking in block order, then its tool calls. A tool call appears once it started: with
its result, as failed if Pi ended it without one, or as running with its output so far. A tool
call that waits to start appears when it starts. The result of every prompt has the token
`usage` of its answers.

## Updates

Pi text and thinking become `agent_message_chunk` and `agent_thought_chunk`. A tool execution
becomes a `tool_call`, `tool_call_update`s with its output so far, and a final update that
completes or fails it with the text of its result. A tool call is created once: if Pi starts a
call again after a restart, the call gets a `tool_call_update`. Each update fits in one
WebSocket frame:
text is split into chunks of at most 64 Ki UTF-16 code units, tool output keeps its last
64 Ki code units, and a raw tool value with longer JSON is left out.

## Models

Pass `models` to `connectAcp` to let a client select the model of a session. Each model must be
on the `Models` that Pi opens with. Sessions then have a `model` select config option, with
category `model`, whose values are `provider/id`. `session/new` and `session/load` return it,
`session/set_config_option` changes the model with `session.setModel`, and a model change
sends `config_option_update`. The option shows the model that Pi has for the session. A
session without one gets the first of `models`. `modelValue(provider, id)` returns the value
of a model.

## Disclaimer

This is mostly a proof of concept to make examples work. This hasn't been fully fleshed out yet and should not be used in production.
