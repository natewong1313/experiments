import type { CreateSessionParams, StateAction } from "@experiments/protocol-schemas/ahp";
import { ROOT, ProtocolError, RpcCodes, errorMessage } from "../ahp/protocol";
import { workingDirectory, type AgentConfig } from "../host-config";
import type { AhpClients } from "../ahp/clients";
import type { HostStore } from "../state/store";
import type { AgentConnections } from "../agent/acp";
import type { LiveSession } from "./record";

type WaitUntil = (work: Promise<void>) => void;

type SessionLifecycleParams = {
  store: HostStore;
  agents: AgentConnections;
  clients: AhpClients;
  hostId: string;
  config: AgentConfig;
  waitUntil: WaitUntil;
};

class SessionLifecycle {
  private readonly store: HostStore;
  private readonly agents: AgentConnections;
  private readonly clients: AhpClients;
  private readonly hostId: string;
  private readonly config: AgentConfig;
  private readonly waitUntil: WaitUntil;

  constructor({ store, agents, clients, hostId, config, waitUntil }: SessionLifecycleParams) {
    this.store = store;
    this.agents = agents;
    this.clients = clients;
    this.hostId = hostId;
    this.config = config;
    this.waitUntil = waitUntil;
  }

  create(input: CreateSessionParams): void {
    const { provider } = this.config.agent;
    const directory = workingDirectory(this.config.cwd);

    if ((input.provider ?? provider) !== provider) {
      throw new ProtocolError(RpcCodes.providerMissing, "Provider does not exist");
    }

    if (input.workingDirectories?.some((candidate) => candidate !== directory) === true) {
      throw new ProtocolError(RpcCodes.params, `This agent uses ${directory}`);
    }

    const sessionKey = `${this.hostId}/${crypto.randomUUID()}`;

    const publication = this.store.create({
      uri: input.channel,
      sessionKey,
      provider,
      workingDirectory: directory,
    });

    this.clients.broadcast({ actions: publication.actions });
    this.clients.notify(ROOT, "root/sessionAdded", {
      summary: publication.summary,
    });
    const record = this.store.require(input.channel);
    this.waitUntil(this.prepareSession(record));
  }

  async dispose(channel: string): Promise<void> {
    const record = this.store.requireMetadata(channel);

    if (channel !== record.uri) {
      throw new ProtocolError(RpcCodes.params, "Dispose the session channel");
    }

    this.clients.broadcast(this.store.remove(record.uri));
    this.clients.notify(ROOT, "root/sessionRemoved", { session: record.uri });
    this.clients.dropChannels([record.uri, record.chatUri]);
    await this.agents.release(record);
  }

  recover(record: LiveSession): void {
    if (record.session.lifecycle === "creating") {
      this.publish(record.uri, {
        type: "session/creationFailed",
        error: {
          errorType: "interrupted",
          message: "Session creation was interrupted by a host restart",
        },
      });
    }
  }

  private async prepareSession(original: LiveSession): Promise<void> {
    const { uri } = original;

    try {
      const agent = await this.agents.get(original);
      const current = this.store.lookup(uri);

      if (!current) {
        await this.agents.release(original);

        return;
      }

      if (current.sessionKey !== original.sessionKey) {
        return;
      }

      this.store.bindAgent(uri, agent.sessionId);
      agent.activate();
      this.publish(uri, { type: "session/ready" });
      await this.agents.idle(original);
    } catch (error) {
      if (this.store.lookup(uri)?.sessionKey === original.sessionKey) {
        const failure = error instanceof Error ? error : new Error("Agent operation failed");

        this.publish(uri, {
          type: "session/creationFailed",
          error: { errorType: "agent", message: errorMessage(failure) },
        });
      }
    }
  }

  private publish(channel: string, action: StateAction): void {
    this.clients.broadcast(this.store.apply(channel, action));
  }
}

export { SessionLifecycle };
