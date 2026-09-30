import * as z from "zod";
import { uriSchema } from "../common";

const TelemetryCapabilitiesSchema = z.strictObject({
  logs: uriSchema.optional(),
  traces: uriSchema.optional(),
  metrics: uriSchema.optional(),
});

const OtlpExportNotificationSchema = z.strictObject({
  channel: uriSchema,
  payload: z.record(z.string(), z.unknown()),
});

type TelemetryCapabilities = z.output<typeof TelemetryCapabilitiesSchema>;
type OtlpExportNotification = z.output<typeof OtlpExportNotificationSchema>;

export {
  OtlpExportNotificationSchema,
  TelemetryCapabilitiesSchema,
  type OtlpExportNotification,
  type TelemetryCapabilities,
};
