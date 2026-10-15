// Exceptions can contain any thrown value, including values outside the wire schemas.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Agent operation failed";
}
