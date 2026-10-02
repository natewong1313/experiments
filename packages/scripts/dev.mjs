import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BAD_GATEWAY = 502;
const docker = process.env.WRANGLER_DOCKER_BIN ?? "docker";
const dockerHost =
  process.env.WRANGLER_DOCKER_HOST ??
  process.env.DOCKER_HOST ??
  JSON.parse(
    execFileSync(docker, ["context", "inspect"], { encoding: "utf8" }),
  )[0].Endpoints.docker.Host;
if (!dockerHost.startsWith("unix://")) {
  throw new Error(
    "The local container workaround requires a Unix Docker socket",
  );
}
const socketPath = dockerHost.slice("unix://".length);
const agent = new http.Agent();

/**
 * @param {http.IncomingMessage} request
 * @param {http.OutgoingHttpHeaders} [headers]
 */
function upstreamRequest(request, headers = request.headers) {
  return http.request({
    socketPath,
    path: request.url,
    method: request.method,
    headers,
    agent,
  });
}

/** @param {http.IncomingMessage} request @param {http.ServerResponse} response */
async function forward(request, response) {
  let body;
  /** @type {http.OutgoingHttpHeaders} */
  let headers = request.headers;
  const url = new URL(request.url ?? "/", "http://docker");
  if (
    request.method === "POST" &&
    url.pathname.endsWith("/containers/create") &&
    url.searchParams.get("name")?.endsWith("-proxy")
  ) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const config = JSON.parse(Buffer.concat(chunks).toString());
    if (
      config.Image === process.env.MINIFLARE_CONTAINER_EGRESS_IMAGE ||
      /^(docker\.io\/)?cloudflare\/proxy-everything[:@]/.test(config.Image)
    ) {
      // Docker sets this inside the sidecar namespace before it starts.
      // https://github.com/cloudflare/workerd/issues/6860
      config.HostConfig ??= {};
      config.HostConfig.Sysctls ??= {};
      config.HostConfig.Sysctls["net.ipv4.conf.all.src_valid_mark"] = "0";
    }
    body = JSON.stringify(config);
    headers = { ...headers, "content-length": Buffer.byteLength(body) };
    delete headers["transfer-encoding"];
  }
  const upstream = upstreamRequest(request, headers);
  upstream.on("response", (result) => {
    response.writeHead(result.statusCode ?? BAD_GATEWAY, result.headers);
    result.pipe(response);
  });
  upstream.on("error", () => {
    if (response.headersSent) response.destroy();
    else response.writeHead(BAD_GATEWAY).end("Docker API connection failed");
  });
  request.on("aborted", () => upstream.destroy());
  response.on("close", () => upstream.destroy());
  if (body !== undefined) upstream.end(body);
  else request.pipe(upstream);
}

const server = http.createServer((request, response) => {
  void forward(request, response).catch(() => {
    response.writeHead(BAD_GATEWAY).end("Docker API request failed");
  });
});
// Preserve Docker's upgraded streams, including exec/attach connections.
server.on("upgrade", (request, socket, head) => {
  const connection = createConnection({ path: socketPath });
  let requestHead = `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`;
  const HEADER_PAIR_SIZE = 2;
  for (
    let index = 0;
    index < request.rawHeaders.length;
    index += HEADER_PAIR_SIZE
  ) {
    requestHead += `${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}\r\n`;
  }
  connection.write(`${requestHead}\r\n`);
  if (head.length) connection.write(head);
  socket.on("error", () => connection.destroy());
  connection.on("error", () => socket.destroy());
  socket.on("close", () => connection.destroy());
  connection.on("close", () => socket.destroy());
  socket.pipe(connection).pipe(socket);
});
const connections = new Set();
server.on("connection", (socket) => {
  connections.add(socket);
  socket.on("close", () => connections.delete(socket));
  socket.on("error", () => socket.destroy());
});

const directory = await mkdtemp(join(tmpdir(), "harness-docker-"));
try {
  server.listen(join(directory, "docker.sock"));
  await once(server, "listening");
  const args = process.argv.slice(2);
  const [mode] = args;
  const useVite = mode === "--vite";
  if (useVite) args.shift();
  const child = spawn(useVite ? "vite" : "wrangler", ["dev", ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      DOCKER_HOST: dockerHost,
      WRANGLER_DOCKER_HOST: `unix://${join(directory, "docker.sock")}`,
    },
  });
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const [code, signal] = await once(child, "exit");
    process.exitCode = code ?? 1;
    if (signal) process.exitCode = 1;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
} finally {
  for (const connection of connections) connection.destroy();
  agent.destroy();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
