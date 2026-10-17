import * as z from "zod";
import { tryN } from "durable-utils/retries";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 2000;

/** The fields that Durable Objects set on an error that a caller can retry. */
const RetryableErrorSchema = z.object({
  retryable: z.literal(true),
  overloaded: z.boolean().optional(),
});

export type DoRpcRetryOptions = {
  /** Total attempts per call. Defaults to 3. */
  attempts?: number;
  /** Base delay for full-jitter backoff, in milliseconds. Defaults to 100. */
  baseDelayMs?: number;
  /** Maximum backoff cap, in milliseconds. Defaults to 2000. */
  maxDelayMs?: number;
};

/**
 * Calls a Durable Object RPC and retries on failures.
 *
 * Each attempt gets a new stub from `stub`.
 * Only errors that the Durable Object marks as retryable cause a retry.
 */
export async function callDoRpc<S, T>(
  stub: () => S,
  call: (stub: S) => Promise<T>,
  options: DoRpcRetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  return tryN<T>(attempts, () => call(stub()), {
    isRetryable: (error) => isRetryable(error),
    baseDelayMs,
    maxDelayMs,
  });
}

/**
 * Returns true if the Durable Object marked the error as retryable and not overloaded.
 * `tryN` retries when its check returns undefined, so this check always returns a boolean.
 */
// Exceptions can contain any thrown value.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
function isRetryable(error: unknown): boolean {
  const parsed = RetryableErrorSchema.safeParse(error);

  return parsed.success && parsed.data.overloaded !== true;
}
