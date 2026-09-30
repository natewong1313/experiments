import * as z from "zod";
import { ProtectedResourceMetadataSchema, uriSchema } from "./common";

const UnsupportedProtocolVersionDataSchema = z.strictObject({
  supportedVersions: z.array(z.string()),
});

const AuthRequiredDataSchema = z.strictObject({
  resources: z.array(ProtectedResourceMetadataSchema),
});

const PermissionDeniedDataSchema = z.strictObject({
  request: z.strictObject({
    channel: uriSchema,
    uri: uriSchema,
    read: z.boolean().optional(),
    write: z.boolean().optional(),
  }).optional(),
});

const AhpErrorDataSchema = z.union([
  UnsupportedProtocolVersionDataSchema,
  AuthRequiredDataSchema,
  PermissionDeniedDataSchema,
]);

type UnsupportedProtocolVersionData = z.output<typeof UnsupportedProtocolVersionDataSchema>;
type AuthRequiredData = z.output<typeof AuthRequiredDataSchema>;
type PermissionDeniedData = z.output<typeof PermissionDeniedDataSchema>;
type AhpErrorData = z.output<typeof AhpErrorDataSchema>;

export {
  AhpErrorDataSchema,
  AuthRequiredDataSchema,
  PermissionDeniedDataSchema,
  UnsupportedProtocolVersionDataSchema,
  type AhpErrorData,
  type AuthRequiredData,
  type PermissionDeniedData,
  type UnsupportedProtocolVersionData,
};
