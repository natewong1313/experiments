import { callDoRpc } from "../shared/do-rpc";
import type { StubFor } from "../shared/stubs";
import type { HostSessionEntry } from "../shared/rpc/host";

/**
 * Sends the catalog changes of one session to its host. Each call starts after the call before
 * it settles. Thus a removal that starts during a `sessionCreated` call reaches the host after
 * it.
 */
export class HostCatalog {
  private host: () => StubFor<"host">;
  // Resolves after the last call settles. It never rejects.
  private lastCall: Promise<null> = Promise.resolve(null);

  constructor(host: () => StubFor<"host">) {
    this.host = host;
  }

  /** Adds the session to the catalog, with the summary of `entry`. */
  async created(entry: HostSessionEntry): Promise<void> {
    await this.call(async (host) => {
      await host.sessionCreated(entry);
    });
  }

  /** Sends the summary of the session at the revision of `entry`. */
  async summaryChanged(entry: HostSessionEntry): Promise<void> {
    await this.call(async (host) => {
      await host.summaryChanged(entry);
    });
  }

  /** Removes the catalog entry of this creation. Returns whether the host removed it. */
  async removed(sessionId: string, defaultChat: string): Promise<boolean> {
    const result = await this.call(
      async (host) => await host.sessionRemoved({ sessionId, defaultChat }),
    );

    return result.removed;
  }

  /**
   * Removes any catalog entry with the session ID. Only a session object without a session
   * calls this method. Returns whether the host removed an entry.
   */
  async orphanRemoved(sessionId: string): Promise<boolean> {
    const result = await this.call(async (host) => await host.orphanRemoved({ sessionId }));

    return result.removed;
  }

  private async call<T>(send: (host: StubFor<"host">) => Promise<T>): Promise<T> {
    const result = this.afterLastCall(send);
    this.lastCall = settled(result);

    return await result;
  }

  private async afterLastCall<T>(send: (host: StubFor<"host">) => Promise<T>): Promise<T> {
    await this.lastCall;

    return await callDoRpc(this.host, send);
  }
}

/** Resolves with null after `promise` settles. It never rejects. */
async function settled(promise: Promise<unknown>): Promise<null> {
  try {
    await promise;
  } catch {
    // The caller of `promise` receives the failure.
  }

  return null;
}
