import {
  AhpErrorCodes as AHPErrorCodes,
  JsonRpcErrorCodes as AHPJsonRpcErrorCodes,
} from "@microsoft/agent-host-protocol";
import type { JsonValue } from "@experiments/protocol-schemas";

/** The URI of the root channel. */
export const ROOT_CHANNEL = "ahp-root://";

/** An AHP error that the host sends to the client as a JSON-RPC error. */
export class AHPError extends Error {
  readonly code: number;
  readonly data: JsonValue | undefined;

  constructor(
    message: string,
    code: number = AHPJsonRpcErrorCodes.InvalidParams,
    data?: JsonValue,
  ) {
    super(message);
    this.name = "AHPError";
    this.code = code;
    this.data = data;
  }
}

/** Returns the AHP error for a session that does not exist. */
export function sessionNotFound(): AHPError {
  return new AHPError("Session does not exist", AHPErrorCodes.SessionNotFound);
}

/** Returns the AHP error for a chat channel that its session does not have. */
export function chatNotFound(): AHPError {
  return new AHPError("Channel does not belong to this session", AHPErrorCodes.NotFound);
}

/** True if the error reports that a session or a chat channel does not exist. */
export function isNotFound({ code }: AHPError): boolean {
  return code === AHPErrorCodes.SessionNotFound || code === AHPErrorCodes.NotFound;
}

/** Returns the AHP error for a session ID that another session uses. */
export function sessionAlreadyExists(): AHPError {
  return new AHPError("Session already exists", AHPErrorCodes.SessionAlreadyExists);
}
