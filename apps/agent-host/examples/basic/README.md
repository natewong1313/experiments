# Self-hosting example

This Worker imports `@experiments/agent-host` and exports an `AgentHost` subclass.
Its [connection hook](./src/agent-host.ts) opens an ACP WebSocket through a named
container or the example's `ACP_URL` override. `getAgentConfig()` advertises Pi
and uses `WORKSPACE_DIR` as the working directory.
It also extends `@experiments/harness-container` and passes `WORKSPACE_DIR` into
the container through `getContainerEnv()`.

`wrangler.jsonc` binds both exported subclasses, declares SQLite storage with
`exports`, and builds the shared harness Dockerfile. The Worker name stays
`agent-host`, and the class names stay `AgentHost` and `HarnessContainer`.

The Worker routes `/hosts/<host-id>/ahp` to a named host Durable Object. Clients
using the same host ID share its sessions. IDs contain 1–64 letters, digits,
underscores, or hyphens. `GET /health` checks the Worker. These routes have no
authentication.

## Run locally

Docker must be installed and running. From the repository root:

```sh
pnpm install
cp apps/agent-host/examples/basic/.env.example apps/agent-host/examples/basic/.env
```

Fill in `CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID` in `examples/basic/.env`.
If you already have credentials in the parent package or the harness example,
copy that `.env` file instead. Local secrets are ignored by Git.

```sh
pnpm --filter @experiments/agent-host-example cf-typegen
pnpm --filter @experiments/agent-host-example dev
```

The development command uses `wrangler-dev-linux` from `@experiments/scripts`,
as in the [harness example](../../../harness-container/example/README.md). It applies
the Linux container networking workaround to Cloudflare's Docker proxy and
requires a Unix Docker socket. One Wrangler config runs the host and its
containers. For an unaffected Docker environment, run `pnpm exec wrangler dev`
directly from this directory.

## Send a prompt

With the Worker running, use the example AHP client:

```sh
pnpm --filter @experiments/agent-host-example prompt \
  ws://localhost:8787/hosts/example/ahp 'Say hello in one sentence.'
```

The client initializes AHP, creates a session, waits for it to become ready,
subscribes to its default chat, and sends `chat/turnStarted`. It prints streamed
text to stdout, reports the session and chat URIs to stderr, and disposes the
session before closing. With no arguments it uses the endpoint and prompt above.
Use [client/prompt.ts](./client/prompt.ts) as a starting point for your own client.

## Use a direct ACP bridge

For development, `ACP_URL` can point to the harness bridge directly. Run the
bridge as described in [the harness README](../../../harness-container/README.md),
then run this command from the repository root:

```sh
pnpm --filter @experiments/agent-host-example exec wrangler dev \
  --var ACP_URL:http://127.0.0.1:8080/acp
```

An empty `ACP_URL`, the default, uses the Durable Object namespace binding.
The direct bridge permits one connection, so use one session at a time with this
override.

## Deploy your own Worker

Use this directory as the starting point for your Worker. Keep the package
dependencies and export your subclasses from the entrypoint. Match class names
in `durable_objects.bindings`, `containers`, and `exports` in Wrangler. Set the
Worker name to your own deployment name. If you relocate the example, update
the image and build context paths to the harness package, or use your own image.

From this directory, configure provider secrets, then deploy:

```sh
pnpm exec wrangler secret put CLOUDFLARE_API_KEY
pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID
pnpm deploy
```

Local `.env` values are not uploaded. Wrangler authentication is separate from
the Workers AI credentials passed into pi.

## Checks

From the repository root:

```sh
pnpm --filter @experiments/agent-host check-types
pnpm --filter @experiments/agent-host test
pnpm --filter @experiments/agent-host-example check-types
pnpm --filter @experiments/agent-host-example build
```

`build` dry-runs deployment and builds the container without deploying. For a
Worker-only packaging check, run `pnpm exec wrangler deploy --dry-run
--containers-rollout=none` in this directory. That check does not validate the image.

## Conformance checks

With the Worker running:

```sh
AHP_URL=ws://localhost:8787/hosts/conformance/ahp pnpm test:ahp
```

The suite skips session and chat checks unless `AHP_SESSION_URI` names an existing
ready session. `AHP_TEST_MUTATIONS=1` enables title and invalid-action checks.
`AHP_RETAINED_TURN_IDS` enables the complete history check. See the
[conformance README](../../../../packages/ahp-conformance/README.md) for fixture details.
