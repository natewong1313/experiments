// Race an operation against a timer.
async function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  abort: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout: Promise<never> = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      abort();
      reject(new Error("Agent operation timed out"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export { withDeadline };
