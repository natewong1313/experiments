import * as z from "zod";
import { seqSchema, uriSchema } from "./common";
import { TerminalActionSchema, TerminalStateSchema } from "./channels/terminal";
import {
  ChangesetActionSchema,
  ChangesetStateSchema,
} from "./channels/changeset";
import {
  ResourceWatchActionSchema,
  ResourceWatchStateSchema,
} from "./channels/resource-watch";
import {
  AnnotationsActionSchema,
  AnnotationsStateSchema,
} from "./channels/annotations";
import {
  AutomationActionSchema,
  AutomationStateSchema,
} from "./channels/automation";
import {
  AutomationRunActionSchema,
  AutomationRunStateSchema,
} from "./channels/automation-run";
import { ChatActionSchema } from "./channels/chat/actions";
import { ChatStateSchema } from "./channels/chat/state";
import { RootActionSchema, RootStateSchema } from "./channels/root";
import { SessionActionSchema } from "./channels/session/actions";
import { SessionStateSchema } from "./channels/session/state";

const ChannelStateSchema = z.union([
  RootStateSchema,
  SessionStateSchema,
  TerminalStateSchema,
  ChangesetStateSchema,
  ResourceWatchStateSchema,
  AnnotationsStateSchema,
  ChatStateSchema,
  AutomationStateSchema,
  AutomationRunStateSchema,
]);

const StateActionSchema = z.union([
  RootActionSchema,
  SessionActionSchema,
  TerminalActionSchema,
  ChangesetActionSchema,
  ResourceWatchActionSchema,
  AnnotationsActionSchema,
  ChatActionSchema,
  AutomationActionSchema,
  AutomationRunActionSchema,
]);

const SnapshotSchema = z.strictObject({
  resource: uriSchema,
  state: ChannelStateSchema,
  fromSeq: seqSchema,
});

const ActionOriginSchema = z.strictObject({
  clientId: z.string(),
  clientSeq: z.number(),
});

const ActionEnvelopeSchema = z.strictObject({
  channel: uriSchema,
  action: StateActionSchema,
  serverSeq: seqSchema,
  origin: ActionOriginSchema.optional(),
  rejectionReason: z.string().optional(),
});

type ChannelState = z.output<typeof ChannelStateSchema>;
type StateAction = z.output<typeof StateActionSchema>;
type Snapshot = z.output<typeof SnapshotSchema>;
type ActionOrigin = z.output<typeof ActionOriginSchema>;
type ActionEnvelope = z.output<typeof ActionEnvelopeSchema>;

export {
  ActionEnvelopeSchema,
  ActionOriginSchema,
  ChannelStateSchema,
  SnapshotSchema,
  StateActionSchema,
  type ActionEnvelope,
  type ActionOrigin,
  type ChannelState,
  type Snapshot,
  type StateAction,
};
