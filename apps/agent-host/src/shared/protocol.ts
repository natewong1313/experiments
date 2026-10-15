import { JsonRpcErrorCodes as AHPJsonRpcErrorCodes } from "@microsoft/agent-host-protocol";
import type { JsonValue } from "@experiments/protocol-schemas";
import { errorMessage } from "./errors";

/**
 * Shared AHP stuff
 */
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

/**
 * Returns `cause` if it is an `AHPError`.
 * Otherwise, returns a new `AHPError` with the message of `cause`.
 */
export function toAHPError(cause: unknown): AHPError {
  return cause instanceof AHPError ? cause : new AHPError(errorMessage(cause));
}
