import * as z from "zod";
import { uriSchema } from "../common";

export const ResourceWatchStateSchema = z.strictObject({
  root: uriSchema,
  recursive: z.boolean(),
  excludes: z.strictObject({ items: z.array(z.string()) }).optional(),
  includes: z.strictObject({ items: z.array(z.string()) }).optional(),
});

export const ResourceChangeSchema = z.strictObject({
  uri: uriSchema,
  type: z.enum(["added", "updated", "deleted"]),
});

export const ResourceWatchActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("resourceWatch/changed"),
    changes: z.strictObject({ items: z.array(ResourceChangeSchema) }),
  }),
]);

export type ResourceWatchState = z.output<typeof ResourceWatchStateSchema>;

export type ResourceChange = z.output<typeof ResourceChangeSchema>;

export type ResourceWatchAction = z.output<typeof ResourceWatchActionSchema>;
