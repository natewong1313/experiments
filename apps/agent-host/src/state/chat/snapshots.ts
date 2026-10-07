import type { ChatState } from "@experiments/protocol-schemas/ahp";
import { MAX_SNAPSHOT_BYTES, RESPONSE_RESERVE_BYTES, checkBytes } from "../../memory";
import type { ChatStore } from "./chat-store";
import type { PartsStore } from "./parts-store";
import type { TurnHistory } from "./history";

type ChatSnapshotsParams = { chats: ChatStore; parts: PartsStore; history: TurnHistory };

class ChatSnapshots {
  private readonly chats: ChatStore;
  private readonly parts: PartsStore;
  private readonly history: TurnHistory;

  constructor({ chats, parts, history }: ChatSnapshotsParams) {
    this.chats = chats;
    this.parts = parts;
    this.history = history;
  }

  readWithActiveOutput(uri: string): ChatState {
    const chat = this.chats.readMetadata(uri);

    if (!chat.activeTurn) {
      return chat;
    }

    return {
      ...chat,
      activeTurn: {
        ...chat.activeTurn,
        responseParts: this.parts.readWithText(uri, chat.activeTurn.id),
      },
    };
  }

  snapshotBytes(uri: string): number {
    return this.chats.activeStateBytes(uri) + this.history.storedBytes(uri);
  }

  readSnapshot(uri: string, count?: number): ChatState {
    const liveBytes = this.chats.activeStateBytes(uri);

    checkBytes(
      liveBytes,
      MAX_SNAPSHOT_BYTES - RESPONSE_RESERVE_BYTES,
      "Active turn exceeds the snapshot memory budget",
    );
    const budget = MAX_SNAPSHOT_BYTES - liveBytes - RESPONSE_RESERVE_BYTES;

    if (count !== void 0) {
      return {
        ...this.readWithActiveOutput(uri),
        ...this.history.readPageBefore(uri, Number.MAX_SAFE_INTEGER, count, budget),
      };
    }

    checkBytes(
      this.history.storedBytes(uri),
      budget,
      "Snapshot exceeds the memory budget; subscribe with view.turns and use fetchTurns",
    );

    return { ...this.readWithActiveOutput(uri), turns: this.history.readAll(uri) };
  }
}

export { ChatSnapshots };
