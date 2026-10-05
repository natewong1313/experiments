import { and, asc, eq, gt, min, sql, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/durable-sqlite";
import type { ActionEnvelope, ActionOrigin, StateAction } from "@experiments/protocol-schemas/ahp";
import { host, actions, dispatches } from "./schema";
import { MAX_REPLAY_BYTES, jsonSize } from "../memory";
import { MAX_FRAME_BYTES } from "../ahp/protocol";

const HOST_ID = 1;

const SEQUENCE_INCREMENT = 1;

const REPLAY_LIMIT = 1000;

type Database = ReturnType<typeof drizzle>;

type SaveDispatchResultParams = {
  origin: ActionOrigin;
  frame: string;
  envelope: ActionEnvelope;
};

class ActionJournal {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  get sequence(): number {
    return this.readCheckpoint().seq;
  }

  get retentionFloor(): number {
    const checkpoint = this.readCheckpoint();

    const oldest = this.db
      .select({ seq: min(actions.seq) })
      .from(actions)
      .get()?.seq;

    return Math.max(
      checkpoint.replayFloor,
      oldest === null || oldest === void 0 ? checkpoint.seq : oldest - 1,
    );
  }

  append(channel: string, action: StateAction, origin?: ActionOrigin): ActionEnvelope {
    const serverSeq = this.sequence + SEQUENCE_INCREMENT;

    const envelope: ActionEnvelope = { channel, action, serverSeq };

    if (origin) {
      envelope.origin = origin;
    }

    this.db.update(host).set({ seq: serverSeq }).where(eq(host.id, HOST_ID)).run();

    const bytes = jsonSize(envelope);

    if (bytes > MAX_FRAME_BYTES) {
      this.db.update(host).set({ replayFloor: serverSeq }).where(eq(host.id, HOST_ID)).run();
    } else {
      this.db.insert(actions).values({ seq: serverSeq, envelope, bytes }).run();
      this.db
        .update(host)
        .set({ replayBytes: sql`${host.replayBytes} + ${bytes}` })
        .where(eq(host.id, HOST_ID))
        .run();
    }

    this.trimReplay(serverSeq);

    return envelope;
  }

  private trimReplay(sequence: number): void {
    let retained = this.readCheckpoint().replayBytes;

    for (;;) {
      const row = this.db
        .select({ seq: actions.seq, bytes: actions.bytes })
        .from(actions)
        .orderBy(asc(actions.seq))
        .limit(SEQUENCE_INCREMENT)
        .get();

      if (!row || (row.seq > sequence - REPLAY_LIMIT && retained <= MAX_REPLAY_BYTES)) {
        break;
      }

      this.db.delete(actions).where(eq(actions.seq, row.seq)).run();
      retained -= row.bytes;
    }

    this.db.update(host).set({ replayBytes: retained }).where(eq(host.id, HOST_ID)).run();
  }

  readReplay(since: number, channels: string[]): ActionEnvelope[] | null {
    const floor = this.readCheckpoint();

    const oldest =
      this.db
        .select({ seq: min(actions.seq) })
        .from(actions)
        .get()?.seq ?? null;

    if (
      since < floor.replayFloor ||
      since > floor.seq ||
      (oldest !== null && since < oldest - SEQUENCE_INCREMENT)
    ) {
      return null;
    }

    if (channels.length === 0) {
      return [];
    }

    const match = and(
      gt(actions.seq, since),
      inArray(sql<string>`json_extract(${actions.envelope}, '$.channel')`, channels),
    );

    const bytes =
      this.db
        .select({
          value: sql<number>`COALESCE(SUM(${actions.bytes}), 0)`,
        })
        .from(actions)
        .where(match)
        .get()?.value ?? 0;

    if (bytes > MAX_REPLAY_BYTES) {
      return null;
    }

    return this.db
      .select({ envelope: actions.envelope })
      .from(actions)
      .where(match)
      .orderBy(asc(actions.seq))
      .all()
      .map((row) => row.envelope);
  }

  lookupDispatchResult(origin: ActionOrigin): { frame: string; envelope: ActionEnvelope } | null {
    const match = and(
      eq(dispatches.clientId, origin.clientId),
      eq(dispatches.clientSeq, origin.clientSeq),
    );

    return (
      this.db
        .select({ frame: dispatches.frame, envelope: dispatches.envelope })
        .from(dispatches)
        .where(match)
        .get() ?? null
    );
  }

  saveDispatchResult({ origin, frame, envelope }: SaveDispatchResultParams): void {
    this.db
      .insert(dispatches)
      .values({
        clientId: origin.clientId,
        clientSeq: origin.clientSeq,
        frame,
        envelope,
      })
      .run();
  }

  private readCheckpoint(): { seq: number; replayFloor: number; replayBytes: number } {
    const row = this.db
      .select({ seq: host.seq, replayFloor: host.replayFloor, replayBytes: host.replayBytes })
      .from(host)
      .where(eq(host.id, HOST_ID))
      .get();

    if (!row) {
      throw new Error("Host storage is not initialized");
    }

    return row;
  }
}

export { ActionJournal };
