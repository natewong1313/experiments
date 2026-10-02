async function withCleanup<T>(
  run: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  let result!: T;
  let scenarioFailed = false;
  let scenarioError: unknown;

  try {
    result = await run();
  } catch (error) {
    scenarioFailed = true;
    scenarioError = error;
  }

  let cleanupFailed = false;
  let cleanupError: unknown;

  try {
    await cleanup();
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
  }

  if (scenarioFailed && cleanupFailed) {
    throw new AggregateError(
      [scenarioError, cleanupError],
      "Scenario and cleanup both failed",
      {
        cause: scenarioError,
      },
    );
  }

  if (scenarioFailed) {
    throw scenarioError;
  }

  if (cleanupFailed) {
    throw cleanupError;
  }

  return result;
}

export { withCleanup };
