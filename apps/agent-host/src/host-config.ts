import type { Stream } from "@agentclientprotocol/sdk";
import * as z from "zod";
import { AgentInfoSchema } from "@experiments/protocol-schemas/ahp";

export const AgentConfigSchema = z.object({
  agent: AgentInfoSchema,
  cwd: z.string().startsWith("/", "Working directory must be an absolute path"),
});

export type AgentConfig = z.output<typeof AgentConfigSchema>;

export type AcpConnectionOptions = {
  sessionKey: string;
  signal: AbortSignal;
};

export type ConnectAcp = (options: AcpConnectionOptions) => Promise<Stream>;

export function workingDirectory(cwd: string): string {
  const directory = new URL("file:///");
  directory.pathname = cwd
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return directory.href;
}

export function workingDirectoryPath(directory: string): string {
  const url = new URL(directory);

  if (url.protocol !== "file:" || url.host !== "") {
    throw new Error("Session working directory must be a local file URI");
  }

  return decodeURIComponent(url.pathname);
}
