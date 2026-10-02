# Self-hosting example

This Worker imports `@experiments/harness-container` and exports a subclass as
`HarnessContainer`. The subclass passes the Worker's `WORKSPACE_DIR` variable
into the container through `getContainerEnv()`.

`wrangler.jsonc` binds `HARNESS_CONTAINER` to that subclass, declares SQLite
storage with `exports`, and builds `../Dockerfile` with the parent package as
its context. The Worker name and exported class stay `harness-container` and
`HarnessContainer`, so the existing agent-host binding still works.

## Run locally

Docker must be installed and running. From the repository root:

```sh
pnpm install
cp apps/harness-container/example/.env.example apps/harness-container/example/.env
```

Fill in `CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID` in `example/.env`.
If you already have credentials in the parent package's `.env`, copy that file
to `example/.env` instead. Local secrets are ignored by Git.

```sh
pnpm --filter @experiments/harness-container-example cf-typegen
pnpm --filter @experiments/harness-container-example dev
```

The development command uses `wrangler-dev-linux` from `@experiments/scripts`.
It sets `src_valid_mark=0` only in Cloudflare's proxy container when Docker
creates it, fixing both ingress and outbound HTTPS on affected Linux hosts.
Host sysctls and Tailscale are unchanged. The wrapper requires a Unix Docker
socket. For an unaffected Docker environment, run `pnpm exec wrangler dev`
directly from this directory.

`GET /health` checks the Worker. Connect an ACP client to
`ws://localhost:8787/agents/<agent-id>/acp`. IDs contain 1–64 letters, digits,
underscores, or hyphens. Each ID selects its own Durable Object and container.
Initialize ACP and create a session in `/workspace` before sending a prompt.
The example exposes these routes without authentication.

With the example running, initialize ACP and send a small model prompt:

```sh
pnpm --filter @experiments/harness-container exec node --experimental-strip-types \
  scripts/smoke.ts ws://localhost:8787/agents/smoke/acp 'Reply with exactly PONG.'
```

To exercise the subclass override, start development with
`--var WORKSPACE_DIR:/workspace/custom` and use `cwd: "/workspace/custom"` when
creating the ACP session.

To use the repository's AHP host and client, follow the
[agent-host example](../../agent-host/examples/basic/README.md). That example exports
both Durable Object subclasses and runs the host and containers in one Worker.

## Deploy your own Worker

Use this directory as the starting point for your Worker. Keep the package
dependency, export your subclass from the entrypoint, and make the class name
match `containers`, `durable_objects.bindings`, and `exports` in Wrangler.
Set the Worker name to your own deployment name. If you relocate the example,
update the image and build context paths to the shared harness package, or use
your own container image.

From this directory, configure the two provider secrets in your Cloudflare
account, then deploy:

```sh
pnpm exec wrangler secret put CLOUDFLARE_API_KEY
pnpm exec wrangler secret put CLOUDFLARE_ACCOUNT_ID
pnpm deploy
```

Local `.env` values are not automatically uploaded. Wrangler authentication is
separate from the Workers AI credentials passed into pi.

## Checks

From the repository root:

```sh
pnpm --filter @experiments/harness-container-example check-types
pnpm --filter @experiments/harness-container-example build
```

`build` dry-runs the deployment and builds the container without deploying.
For a Worker-only packaging check, run `pnpm exec wrangler deploy --dry-run
--containers-rollout=none` here. That check does not validate the image.
