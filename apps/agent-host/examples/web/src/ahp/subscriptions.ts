import type { AhpClient, Subscription } from "@microsoft/agent-host-protocol/client";

type SharedSubscription = {
  users: number;
};

const channels: WeakMap<AhpClient, Map<string, SharedSubscription>> = new WeakMap();

type ReleaseChannel = () => void;

type ChannelLease = {
  result: ReturnType<AhpClient["subscribe"]>;
  subscription: Subscription;
  release: ReleaseChannel;
};

function acquireChannel(client: AhpClient, uri: string): ChannelLease {
  let resources = channels.get(client);

  if (!resources) {
    resources = new Map();
    channels.set(client, resources);
  }

  let shared = resources.get(uri);

  if (!shared) {
    shared = { users: 0 };
    resources.set(uri, shared);
  }

  shared.users += 1;
  const entry = shared;
  const registry = resources;
  const result = client.subscribe(uri);
  const subscription = client.attachSubscription(uri);

  function release(): void {
    void subscription.close();
    entry.users -= 1;

    if (!entry.users) {
      registry.delete(uri);
      void client.unsubscribe(uri);
    }
  }

  return { result, subscription, release };
}

export { acquireChannel };
