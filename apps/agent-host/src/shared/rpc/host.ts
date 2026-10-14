import * as z from "zod";
import { ActionEnvelopeSchema, SessionSummarySchema } from "@experiments/protocol-schemas/ahp";

const SessionActionSchema = ActionEnvelopeSchema.pick({
  channel: true,
  action: true,
  origin: true,
});

export const HostSessionUpdateRequestSchema = z.object({
  sessionId: z.string(),
  revision: z.number(),
  summary: SessionSummarySchema,
  /**
   * Subscribers skip actions at or below their channel's revision, so a second action on the
   * same channel with the same revision would never be delivered.
   */
  actions: z
    .array(SessionActionSchema)
    .refine(
      (actions) => new Set(actions.map((item) => item.channel)).size === actions.length,
      "Expected at most one action per channel",
    ),
});

export type HostSessionUpdateRequest = z.input<typeof HostSessionUpdateRequestSchema>;

export class HostSessionUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostSessionUpdateError";
  }
}

export interface HostRPC extends Rpc.DurableObjectBranded {
  /**
   * A session notifies its host after persisting a state update.
   * Resolves after updating the catalogue and broadcasting or buffering actions for subscribers.
   * Ignores updates for sessions absent from the catalogue.
   *
   * @throws {HostSessionUpdateError} If validation, storage, or socket delivery fails.
   */
  sessionUpdate(req: HostSessionUpdateRequest): Promise<void>;
}
