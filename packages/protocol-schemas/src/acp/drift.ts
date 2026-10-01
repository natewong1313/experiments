import type * as Upstream from "@agentclientprotocol/sdk";
import type {
  AgentCapabilities,
  ClientCapabilities,
  InitializeRequest,
  InitializeResponse,
  ProtocolVersion,
} from "./initialize";
import type { AcpError, RequestId } from "./jsonrpc";
import type {
  CancelNotification,
  PromptRequest,
  PromptResponse,
  PromptTextContent,
  StopReason,
} from "./prompt";
import type {
  ContentBlock,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  SessionId,
  SessionNotification,
  SessionUpdate,
  TextContent,
  ToolCallContent,
  ToolCallStatus,
  ToolKind,
} from "./session";

type Equal<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

// Ignore loose-object index signatures, then compare every modeled field recursively.
type KnownFields<T> = {
  [
    K in keyof T as string extends K ? never : number extends K ? never : K
  ]: T[K];
};
type MatchingVariant<T, U> = U extends { sessionUpdate: infer Kind }
  ? Extract<T, { sessionUpdate: Kind }>
  : U extends { type: infer Kind }
    ? Extract<T, { type: Kind }>
    : T;
type FieldDrift<T, U> = {
  [K in keyof KnownFields<U>]-?: K extends keyof T
    ? Equal<
        Pick<T, never> extends Pick<T, K> ? true : false,
        Pick<U, never> extends Pick<U, K> ? true : false
      > extends true
      ? Drift<T[K], U[K]>
      : false
    : false;
}[keyof KnownFields<U>];
type ValueDrift<T, U> = U extends (infer Item)[]
  ? [T] extends [(infer UpstreamItem)[]]
    ? U extends []
      ? true
      : Drift<UpstreamItem, Item>
    : false
  : U extends object
    ? [MatchingVariant<T, U>] extends [object]
      ? FieldDrift<MatchingVariant<T, U>, U>
      : false
    : Equal<T, U>;
type Drift<T, U> =
  Equal<T, U> extends true
    ? true
    : Equal<
          Extract<T, null | undefined>,
          Extract<U, null | undefined>
        > extends true
      ? [ValueDrift<NonNullable<T>, NonNullable<U>>] extends [true]
        ? true
        : false
      : false;
type Expect<T extends true> = T;

type _AcpDrift = [
  Expect<Equal<Upstream.RequestId, RequestId>>,
  Expect<Drift<Upstream.Error, AcpError>>,
  Expect<Equal<Upstream.ProtocolVersion, ProtocolVersion>>,
  Expect<Drift<Upstream.ClientCapabilities, ClientCapabilities>>,
  Expect<Drift<Upstream.AgentCapabilities, AgentCapabilities>>,
  Expect<Drift<Upstream.InitializeRequest, InitializeRequest>>,
  Expect<Drift<Upstream.InitializeResponse, InitializeResponse>>,
  Expect<Equal<Upstream.SessionId, SessionId>>,
  Expect<Drift<Upstream.NewSessionRequest, NewSessionRequest>>,
  Expect<Drift<Upstream.NewSessionResponse, NewSessionResponse>>,
  Expect<Drift<Upstream.LoadSessionRequest, LoadSessionRequest>>,
  Expect<Drift<Upstream.LoadSessionResponse, LoadSessionResponse>>,
  Expect<Drift<Upstream.ContentBlock, ContentBlock>>,
  Expect<Drift<Upstream.ContentBlock, TextContent>>,
  Expect<Drift<Upstream.ToolCallContent, ToolCallContent>>,
  Expect<Equal<Upstream.ToolKind, ToolKind>>,
  Expect<Equal<Upstream.ToolCallStatus, ToolCallStatus>>,
  Expect<Drift<Upstream.SessionUpdate, SessionUpdate>>,
  Expect<Drift<Upstream.SessionNotification, SessionNotification>>,
  Expect<Drift<Upstream.ContentBlock, PromptTextContent>>,
  Expect<Drift<Upstream.PromptRequest, PromptRequest>>,
  Expect<Drift<Upstream.PromptResponse, PromptResponse>>,
  Expect<Equal<Upstream.StopReason, StopReason>>,
  Expect<Drift<Upstream.CancelNotification, CancelNotification>>,
];
