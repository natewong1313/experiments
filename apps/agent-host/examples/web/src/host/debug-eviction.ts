export const EVICTION_REASON = "Evicted from the agent-host debug panel";

export function evictObject(ctx: DurableObjectState): void {
  ctx.abort(EVICTION_REASON);
}
