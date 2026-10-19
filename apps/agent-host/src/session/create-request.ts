import { AhpErrorCodes as AHPErrorCodes } from "@microsoft/agent-host-protocol";
import { CreateSessionParamsSchema as AHPCreateSessionParamsSchema } from "@experiments/protocol-schemas/ahp";
import { sessionUri } from "../shared/lookups";
import { AHPError } from "../shared/protocol";
import type { SessionCreateRequest } from "../shared/rpc/session";

/** The values that identify a creation. A repeated create must have the same values. */
export type CreateTarget = {
  provider: string;
  // The absolute path that the ACP session runs in.
  cwd: string;
};

type CreateContext = {
  sessionId: string;
  /** The provider of the agent backend. */
  provider: string;
  /** The working directory when the request does not have one. */
  defaultCwd: string;
};

/**
 * Validates the AHP `createSession` parameters for the session object in `context`.
 *
 * @throws {AHPError} If the parameters are not valid for this session.
 */
export function validateCreateRequest(
  input: SessionCreateRequest,
  context: CreateContext,
): CreateTarget {
  const params = AHPCreateSessionParamsSchema.parse(input);

  if (params.channel !== sessionUri(context.sessionId)) {
    throw new AHPError("Channel does not belong to this session");
  }

  if (params.provider !== undefined && params.provider !== context.provider) {
    throw new AHPError("Agent provider does not exist", AHPErrorCodes.ProviderNotFound);
  }

  if (params.config || params.activeClient || (params.workingDirectories?.length ?? 0) > 1) {
    throw new AHPError("Session configuration and multiple working directories are not supported");
  }

  const directory = params.workingDirectories?.[0];
  const cwd = directory === undefined ? context.defaultCwd : localPath(directory);

  if (!cwd.startsWith("/")) {
    throw new AHPError("Working directory must be an absolute path");
  }

  return { provider: context.provider, cwd };
}

/**
 * Converts a local `file:` URI to a file system path.
 *
 * @throws {AHPError} If the URI is not a local file URI.
 */
function localPath(directory: string): string {
  const url = new URL(directory);

  if (url.protocol !== "file:" || url.hostname || url.search || url.hash) {
    throw new AHPError("Expected a local file working directory");
  }

  return decodeURIComponent(url.pathname);
}
