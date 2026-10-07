import type { ActionEnvelope, SessionSummary } from "@experiments/protocol-schemas/ahp";

type Publication = {
  actions: [ActionEnvelope, ...ActionEnvelope[]];
  summary?: SessionSummary;
};

export type { Publication };
