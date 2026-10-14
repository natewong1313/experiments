import type { ActionEnvelope } from "@experiments/protocol-schemas/ahp";

export type DeliveredAction = { envelope: ActionEnvelope; revision: number };
