import type {
  ChatInputRequest,
  ChatState,
  ChatSummary,
  Message,
  MessageAttachment,
  ResponsePart,
  ToolCallState,
  ToolResultContent,
  Turn,
} from "@microsoft/agent-host-protocol";
import type * as z from "zod";
import type { MessageAttachmentSchema, MessageSchema } from "../channels/chat/message";
import type { ChatInputRequestSchema } from "../channels/chat/input";
import type {
  ToolCallStateSchema,
  ToolResultContentSchema,
} from "../channels/chat/tool-call";
import type { ResponsePartSchema } from "../channels/chat/parts";
import type {
  ChatStateSchema,
  ChatSummarySchema,
  TurnSchema,
} from "../channels/chat/state";

type SameKeys<T extends object, U extends object> = [Exclude<keyof T, keyof U>] extends [never]
  ? [Exclude<keyof U, keyof T>] extends [never] ? true : false
  : false;

type Drift<Upstream extends object, Ours extends object> = SameKeys<Upstream, Ours>;

type UnionDrift<Upstream, Ours> = [Upstream] extends [Ours] ? true : false;

type Expect<T extends true> = T;

type MessageDrift = Drift<Message, z.output<typeof MessageSchema>>;
type MessageAttachmentDrift = UnionDrift<MessageAttachment, z.output<typeof MessageAttachmentSchema>>;
type ChatInputRequestDrift = Drift<ChatInputRequest, z.output<typeof ChatInputRequestSchema>>;
type ToolCallStateDrift = UnionDrift<ToolCallState, z.output<typeof ToolCallStateSchema>>;
type ToolResultContentDrift = UnionDrift<ToolResultContent, z.output<typeof ToolResultContentSchema>>;
type ResponsePartDrift = UnionDrift<ResponsePart, z.output<typeof ResponsePartSchema>>;
type ChatSummaryDrift = Drift<ChatSummary, z.output<typeof ChatSummarySchema>>;
type TurnDrift = Drift<Turn, z.output<typeof TurnSchema>>;
type ChatStateDrift = Drift<ChatState, z.output<typeof ChatStateSchema>>;

type _Chat = [
  Expect<MessageDrift>,
  Expect<MessageAttachmentDrift>,
  Expect<ChatInputRequestDrift>,
  Expect<ToolCallStateDrift>,
  Expect<ToolResultContentDrift>,
  Expect<ResponsePartDrift>,
  Expect<ChatSummaryDrift>,
  Expect<TurnDrift>,
  Expect<ChatStateDrift>,
];

