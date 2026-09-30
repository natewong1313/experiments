import type {
  ConfigPropertySchema as UpstreamConfigProperty,
  ConfigSchema,
  ContentRef,
  ErrorInfo,
  FileEdit,
  Icon,
  ProtectedResourceMetadata,
  TextRange,
  TextSelection,
  UsageInfo,
} from "@microsoft/agent-host-protocol";
import type * as z from "zod";
import type {
  ConfigPropertySchema,
  ConfigSchemaSchema,
  ContentRefSchema,
  ErrorInfoSchema,
  FileEditSchema,
  IconSchema,
  ProtectedResourceMetadataSchema,
  TextRangeSchema,
  TextSelectionSchema,
  UsageInfoSchema,
} from "../common";

type SameKeys<T extends object, U extends object> = [Exclude<keyof T, keyof U>] extends [never]
  ? [Exclude<keyof U, keyof T>] extends [never] ? true : false
  : false;

type Drift<Upstream extends object, Ours extends object> = SameKeys<Upstream, Ours>;

type Expect<T extends true> = T;

type ConfigPropertyDrift = Drift<UpstreamConfigProperty, z.output<typeof ConfigPropertySchema>>;
type ConfigSchemaDrift = Drift<ConfigSchema, z.output<typeof ConfigSchemaSchema>>;
type ContentRefDrift = Drift<ContentRef, z.output<typeof ContentRefSchema>>;
type ErrorInfoDrift = Drift<ErrorInfo, z.output<typeof ErrorInfoSchema>>;
type FileEditDrift = Drift<FileEdit, z.output<typeof FileEditSchema>>;
type IconDrift = Drift<Icon, z.output<typeof IconSchema>>;
type ProtectedResourceMetadataDrift = Drift<ProtectedResourceMetadata, z.output<typeof ProtectedResourceMetadataSchema>>;
type TextRangeDrift = Drift<TextRange, z.output<typeof TextRangeSchema>>;
type TextSelectionDrift = Drift<TextSelection, z.output<typeof TextSelectionSchema>>;
type UsageInfoDrift = Drift<UsageInfo, z.output<typeof UsageInfoSchema>>;

type _Common = [
  Expect<ConfigPropertyDrift>,
  Expect<ConfigSchemaDrift>,
  Expect<ContentRefDrift>,
  Expect<ErrorInfoDrift>,
  Expect<FileEditDrift>,
  Expect<IconDrift>,
  Expect<ProtectedResourceMetadataDrift>,
  Expect<TextRangeDrift>,
  Expect<TextSelectionDrift>,
  Expect<UsageInfoDrift>,
];

