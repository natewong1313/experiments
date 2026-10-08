import * as z from "zod";
import { ProtectedResourceMetadataSchema, uriSchema } from "./common";

export const UnsupportedProtocolVersionDataSchema = z.strictObject({
  supportedVersions: z.array(z.string()),
});

export const AuthRequiredDataSchema = z.strictObject({
  resources: z.array(ProtectedResourceMetadataSchema),
});

export const PermissionDeniedDataSchema = z.strictObject({
  request: z
    .strictObject({
      channel: uriSchema,
      uri: uriSchema,
      read: z.boolean().optional(),
      write: z.boolean().optional(),
    })
    .optional(),
});

export const AhpErrorDataSchema = z.union([
  UnsupportedProtocolVersionDataSchema,
  AuthRequiredDataSchema,
  PermissionDeniedDataSchema,
]);

export type UnsupportedProtocolVersionData = z.output<typeof UnsupportedProtocolVersionDataSchema>;

export type AuthRequiredData = z.output<typeof AuthRequiredDataSchema>;

export type PermissionDeniedData = z.output<typeof PermissionDeniedDataSchema>;

export type AhpErrorData = z.output<typeof AhpErrorDataSchema>;
