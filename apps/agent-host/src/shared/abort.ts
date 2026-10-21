/**
 * Helper to race a function that doesn't take in a signal against a signal.
 */
export async function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  const aborted = Promise.withResolvers<never>();

  function abort(): void {
    aborted.reject(signal.reason);
  }

  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener("abort", abort, { once: true });
  }

  try {
    return await Promise.race([promise, aborted.promise]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
