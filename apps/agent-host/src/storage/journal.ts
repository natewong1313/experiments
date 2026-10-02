import { and, asc, eq, gt, lte, min } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/durable-sqlite";
import type {
  ActionEnvelope,
  ActionOrigin,
  StateAction,
} from "@experiments/protocol-schemas/ahp";
import { host, actions, dispatches } from "./schema";

const HOST_ID = 1;

const SEQUENCE_INCREMENT = 1;

const REPLAY_LIMIT = 1000;

type Database = ReturnType<typeof drizzle>;

class ActionJournal {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  get sequence(): number {
    return this.checkpoint().seq;
  }

  append(
    channel: string,
    action: StateAction,
    origin?: ActionOrigin,
  ): ActionEnvelope {
    const serverSeq = this.sequence + SEQUENCE_INCREMENT;

    const envelope: ActionEnvelope = { channel, action, serverSeq };

    if (origin) {
      envelope.origin = origin;
    }

    this.db
      .update(host)
      .set({ seq: serverSeq })
      .where(eq(host.id, HOST_ID))
      .run();
    this.db.insert(actions).values({ seq: serverSeq, envelope }).run();
    this.db
      .delete(actions)
      .where(lte(actions.seq, serverSeq - REPLAY_LIMIT))
      .run();

    return envelope;
  }

  replay(since: number, channels: string[]): ActionEnvelope[] | null {
    const floor = this.checkpoint();

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

    return this.db
      .select({ envelope: actions.envelope })
      .from(actions)
      .where(gt(actions.seq, since))
      .orderBy(asc(actions.seq))
      .all()
      .map((row) => row.envelope)
      .filter((envelope) => channels.includes(envelope.channel));
  }

  previous(
    origin: ActionOrigin,
  ): { frame: string; envelope: ActionEnvelope } | null {
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

  remember({
    origin,
    frame,
    envelope,
  }: {
    origin: ActionOrigin;
    frame: string;
    envelope: ActionEnvelope;
  }): void {
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

  private checkpoint(): { seq: number; replayFloor: number } {
    const row = this.db
      .select({ seq: host.seq, replayFloor: host.replayFloor })
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
