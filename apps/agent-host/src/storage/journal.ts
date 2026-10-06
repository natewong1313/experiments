import { and, asc, eq, gt, min, sql, inArray } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/durable-sqlite";
import type { ActionEnvelope, ActionOrigin, StateAction } from "@experiments/protocol-schemas/ahp";
import { hostTable, actionsTable, dispatchesTable } from "./schema";
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
      .select({ seq: min(actionsTable.seq) })
      .from(actionsTable)
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

    this.db.update(hostTable).set({ seq: serverSeq }).where(eq(hostTable.id, HOST_ID)).run();

    const bytes = jsonSize(envelope);

    if (bytes > MAX_FRAME_BYTES) {
      this.db
        .update(hostTable)
        .set({ replayFloor: serverSeq })
        .where(eq(hostTable.id, HOST_ID))
        .run();
    } else {
      this.db.insert(actionsTable).values({ seq: serverSeq, envelope, bytes }).run();
      this.db
        .update(hostTable)
        .set({ replayBytes: sql`${hostTable.replayBytes} + ${bytes}` })
        .where(eq(hostTable.id, HOST_ID))
        .run();
    }

    this.trimReplay(serverSeq);

    return envelope;
  }

  private trimReplay(sequence: number): void {
    let retained = this.readCheckpoint().replayBytes;

    for (;;) {
      const row = this.db
        .select({ seq: actionsTable.seq, bytes: actionsTable.bytes })
        .from(actionsTable)
        .orderBy(asc(actionsTable.seq))
        .limit(SEQUENCE_INCREMENT)
        .get();

      if (!row || (row.seq > sequence - REPLAY_LIMIT && retained <= MAX_REPLAY_BYTES)) {
        break;
      }

      this.db.delete(actionsTable).where(eq(actionsTable.seq, row.seq)).run();
      retained -= row.bytes;
    }

    this.db.update(hostTable).set({ replayBytes: retained }).where(eq(hostTable.id, HOST_ID)).run();
  }

  readReplay(since: number, channels: string[]): ActionEnvelope[] | null {
    const floor = this.readCheckpoint();

    const oldest =
      this.db
        .select({ seq: min(actionsTable.seq) })
        .from(actionsTable)
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
      gt(actionsTable.seq, since),
      inArray(sql<string>`json_extract(${actionsTable.envelope}, '$.channel')`, channels),
    );

    const bytes =
      this.db
        .select({
          value: sql<number>`COALESCE(SUM(${actionsTable.bytes}), 0)`,
        })
        .from(actionsTable)
        .where(match)
        .get()?.value ?? 0;

    if (bytes > MAX_REPLAY_BYTES) {
      return null;
    }

    return this.db
      .select({ envelope: actionsTable.envelope })
      .from(actionsTable)
      .where(match)
      .orderBy(asc(actionsTable.seq))
      .all()
      .map((row) => row.envelope);
  }

  lookupDispatchResult(origin: ActionOrigin): { frame: string; envelope: ActionEnvelope } | null {
    const match = and(
      eq(dispatchesTable.clientId, origin.clientId),
      eq(dispatchesTable.clientSeq, origin.clientSeq),
    );

    return (
      this.db
        .select({ frame: dispatchesTable.frame, envelope: dispatchesTable.envelope })
        .from(dispatchesTable)
        .where(match)
        .get() ?? null
    );
  }

  saveDispatchResult({ origin, frame, envelope }: SaveDispatchResultParams): void {
    this.db
      .insert(dispatchesTable)
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
      .select({
        seq: hostTable.seq,
        replayFloor: hostTable.replayFloor,
        replayBytes: hostTable.replayBytes,
      })
      .from(hostTable)
      .where(eq(hostTable.id, HOST_ID))
      .get();

    if (!row) {
      throw new Error("Host storage is not initialized");
    }

    return row;
  }
}

export { ActionJournal };
