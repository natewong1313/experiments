import * as z from "zod";
import { uriSchema } from "../common";

const ResourceWatchStateSchema = z.strictObject({
  root: uriSchema,
  recursive: z.boolean(),
  excludes: z.strictObject({ items: z.array(z.string()) }).optional(),
  includes: z.strictObject({ items: z.array(z.string()) }).optional(),
});

const ResourceChangeSchema = z.strictObject({
  uri: uriSchema,
  type: z.enum(["added", "updated", "deleted"]),
});

const ResourceWatchActionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("resourceWatch/changed"),
    changes: z.strictObject({ items: z.array(ResourceChangeSchema) }),
  }),
]);

type ResourceWatchState = z.output<typeof ResourceWatchStateSchema>;

type ResourceChange = z.output<typeof ResourceChangeSchema>;

type ResourceWatchAction = z.output<typeof ResourceWatchActionSchema>;

export {
  ResourceChangeSchema,
  ResourceWatchActionSchema,
  ResourceWatchStateSchema,
  type ResourceChange,
  type ResourceWatchAction,
  type ResourceWatchState,
};
