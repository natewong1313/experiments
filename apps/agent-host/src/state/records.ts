import type { ChatState } from "@experiments/protocol-schemas/ahp";
import type { sessionsTable } from "./persistence/schema";

type SessionRecord = typeof sessionsTable.$inferSelect;

type LiveSession = SessionRecord & { chat: ChatState };

export type { SessionRecord, LiveSession };
