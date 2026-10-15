import * as z from "zod";
import type {
  JsonRpcNotification,
  JsonRpcSuccess,
  JsonRpcFailure,
} from "@experiments/protocol-schemas";

export type JsonRpcMessage = JsonRpcNotification | JsonRpcSuccess | JsonRpcFailure;

export const ChannelParamsSchema = z.object({ channel: z.string() });

export const DispatchActionParamsSchema = z.object({
  channel: z.string(),
  clientSeq: z.int().nonnegative(),
  // Unknown action payloads must survive rejection echoes.
  // oxlint-disable-next-line zod/consistent-object-schema-type
  action: z.looseObject({ type: z.string() }),
});

export type DispatchActionParams = z.output<typeof DispatchActionParamsSchema>;
