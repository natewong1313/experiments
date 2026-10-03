# @experiments/scripts

Shared dev scripts for the monorepo.

## `wrangler-dev-linux`

Wraps `wrangler dev` with a local proxy in front of the Docker API socket.
Pass `--vite` as the first argument to run `vite dev` through the same proxy.

On hosts where `net.ipv4.conf.all.src_valid_mark=1` is set (commonly by Tailscale), Docker containers can inherit that value. It conflicts with the sidecar's transparent routing ([workerd #6860](https://github.com/cloudflare/workerd/issues/6860)). This script intercepts `POST /containers/create` requests for Cloudflare's egress proxy, sets `HostConfig.Sysctls["net.ipv4.conf.all.src_valid_mark"]` to `"0"` in that container's network namespace, and forwards other requests and upgraded exec/attach streams to Docker. Host sysctls remain unchanged.

Requires a Unix Docker socket (the default on Linux).

Usage (in any app that uses Cloudflare containers):

```sh
wrangler-dev-linux [wrangler dev args...]
```

For example, with extra configs:

```sh
wrangler-dev-linux --config wrangler.jsonc --config ../another-worker/wrangler.jsonc
```

For a Vite app using the Cloudflare plugin:

```sh
wrangler-dev-linux --vite --port 3000
```
