import type { ConnectionRouterRPC } from "../shared/rpc/router";
import { newRouterDOName } from "../shared/lookups";

export function getHost<T extends ConnectionRouterRPC>(
  doNamespace: DurableObjectNamespace<T>,
  hostId: string,
): DurableObjectStub<T> {
  const doName = newRouterDOName(hostId);

  return doNamespace.getByName(doName);
}
