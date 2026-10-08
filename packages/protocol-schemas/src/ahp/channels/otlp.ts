import * as z from "zod";
import { uriSchema } from "../common";

export const TelemetryCapabilitiesSchema = z.strictObject({
  logs: uriSchema.optional(),
  traces: uriSchema.optional(),
  metrics: uriSchema.optional(),
});

export const OtlpExportNotificationSchema = z.strictObject({
  channel: uriSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type TelemetryCapabilities = z.output<typeof TelemetryCapabilitiesSchema>;

export type OtlpExportNotification = z.output<typeof OtlpExportNotificationSchema>;
