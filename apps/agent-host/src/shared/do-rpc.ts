import { isErrorRetryable } from "durable-utils/do-utils";
import { tryN } from "durable-utils/retries";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 2000;

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
 * We always grab a fresh stub on each attempt.
 * We use the isErrorRetryable fn from durable-utils to classify errors.
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
    isRetryable: (error) => isErrorRetryable(error),
    baseDelayMs,
    maxDelayMs,
  });
}
