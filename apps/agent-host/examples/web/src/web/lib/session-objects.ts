import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";
import { env } from "cloudflare:workers";

import { readSessionObjects, evictSessionObject } from "../../host/session-objects";
import type { SessionObjects } from "../../host/session-objects";
import { errorMessage } from "./error-message";

const MAX_OBJECT_NAME_LENGTH = 128;
const sessionInputSchema = z.object({ sessionId: z.uuid().toLowerCase() });

const evictionInputSchema = sessionInputSchema.extend({
  kind: z.enum(["root", "session", "router"]),
  name: z.string().min(1).max(MAX_OBJECT_NAME_LENGTH),
});

export type SessionObjectsResult =
  | { status: "ready"; snapshot: SessionObjects }
  | { status: "failed"; message: string };

export const getSessionObjects = createServerFn({ method: "GET" })
  .validator(sessionInputSchema)
  .handler(async ({ data }): Promise<SessionObjectsResult> => {
    try {
      return { status: "ready", snapshot: await readSessionObjects(env, data.sessionId) };
    } catch (error) {
      return { status: "failed", message: errorMessage(error) };
    }
  });

export const evictObject = createServerFn({ method: "POST" })
  .validator(evictionInputSchema)
  .handler(async ({ data }): Promise<void> => {
    await evictSessionObject(env, data.sessionId, data);
  });
