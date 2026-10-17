import * as z from "zod";
import { JsonRpcErrorCodes as AHPJsonRpcErrorCodes } from "@microsoft/agent-host-protocol";
import type { JsonValue } from "@experiments/protocol-schemas";
import { errorMessage } from "../errors";
import { AHPError } from "../protocol";

/**
 * An RPC error that keeps the AHP error code of its cause. Workers RPC keeps `name`, `message`,
 * `code`, and `data`. This lets the router send the same JSON-RPC error to the client.
 */
export class CodedRpcError extends Error {
  readonly code: number;
  readonly data: JsonValue | undefined;

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- cause comes from a catch binding
  constructor(cause: unknown) {
    super(errorMessage(cause));
    this.name = "CodedRpcError";
    this.code = cause instanceof AHPError ? cause.code : AHPJsonRpcErrorCodes.InvalidParams;
    this.data = cause instanceof AHPError ? cause.data : undefined;
  }
}

/** The fields of a `CodedRpcError` after it crosses Workers RPC. */
const CodedErrorSchema = z.object({
  message: z.string(),
  code: z.int(),
  data: z.json().optional(),
});

/**
 * Returns `cause` if it is an `AHPError`. If `cause` is a `CodedRpcError` from another Durable
 * Object, returns an `AHPError` with its code. Otherwise, returns an `AHPError` with the
 * message of `cause`.
 */
// Exceptions can contain any thrown value.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function toAHPError(cause: unknown): AHPError {
  if (cause instanceof AHPError) {
    return cause;
  }

  // Workers RPC copies `code` as an own property.
  // A `DOMException` has a `code` getter on its prototype, which is not an AHP error code.
  const hasOwnCode = cause instanceof Object && Object.hasOwn(cause, "code");
  const coded = CodedErrorSchema.safeParse(hasOwnCode ? cause : undefined);

  if (coded.success) {
    return new AHPError(coded.data.message, coded.data.code, coded.data.data);
  }

  return new AHPError(errorMessage(cause));
}
