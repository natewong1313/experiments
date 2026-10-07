import { StateDatabase } from "./persistence/database";
import { RootStore } from "./host/root-store";
import { SessionStore } from "./host/session-store";
import { PartsStore } from "./chat/parts-store";
import { TurnStore } from "./chat/turn-store";
import { ChatStore } from "./chat/chat-store";
import { TurnHistory } from "./chat/history";
import { ChatSnapshots } from "./chat/snapshots";
import { ChatTransitions } from "./chat/transitions";
import { ActionJournal } from "./replay/journal";
import { ResourceStore } from "./content/resource-store";
import { ActionContent } from "./content/action-content";
import { HostQueries } from "./queries";
import { HostMutations } from "./mutations";

type HostState = {
  queries: HostQueries;
  mutations: HostMutations;
  migrate(): Promise<void>;
};

function createHostState(storage: DurableObjectStorage): HostState {
  const database = new StateDatabase(storage);
  const { db } = database;
  const root = new RootStore(db);
  const sessions = new SessionStore(db);
  const parts = new PartsStore(db);
  const turns = new TurnStore({ db, parts });
  const chats = new ChatStore({ db, turns });
  const history = new TurnHistory({ db, turns });
  const snapshots = new ChatSnapshots({ chats, parts, history });
  const transitions = new ChatTransitions({ chats, turns, parts, history });
  const journal = new ActionJournal(db);
  const resources = new ResourceStore(db);
  const content = new ActionContent(resources);

  const queries = new HostQueries({
    root,
    sessions,
    chats,
    turns,
    parts,
    history,
    snapshots,
    journal,
    resources,
  });

  const mutations = new HostMutations({
    database,
    root,
    sessions,
    journal,
    resources,
    content,
    transitions,
    queries,
  });

  return {
    queries,
    mutations,
    migrate: (): Promise<void> => database.migrate(),
  };
}

export { createHostState, type HostState };
