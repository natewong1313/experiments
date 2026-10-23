/**
 * Reads a human-readable message from a thrown value.
 *
 * Errors cross the Worker and WebSocket boundaries as plain objects, so a
 * thrown value is not always an `Error` instance.
 *
 * @param cause - The value a `catch` clause received.
 */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Unknown error";
}
