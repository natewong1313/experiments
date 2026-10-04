import * as z from "zod";

const MAX_PROTOCOL_VERSION = 65_535;
const MIN_PROTOCOL_VERSION = 0;
const ProtocolVersionSchema = z
  .int()
  .gte(MIN_PROTOCOL_VERSION)
  .lte(MAX_PROTOCOL_VERSION);

const ClientCapabilitiesSchema = z.strictObject({});
const InitializeRequestSchema = z.strictObject({
  protocolVersion: ProtocolVersionSchema,
  clientCapabilities: ClientCapabilitiesSchema.optional(),
});

const AgentCapabilitiesSchema = z.looseObject({
  loadSession: z.boolean().optional(),
});
const InitializeResponseSchema = z.looseObject({
  protocolVersion: ProtocolVersionSchema,
  agentCapabilities: AgentCapabilitiesSchema.optional(),
});

type ProtocolVersion = z.output<typeof ProtocolVersionSchema>;
type ClientCapabilities = z.output<typeof ClientCapabilitiesSchema>;
type InitializeRequest = z.output<typeof InitializeRequestSchema>;
type AgentCapabilities = z.output<typeof AgentCapabilitiesSchema>;
type InitializeResponse = z.output<typeof InitializeResponseSchema>;

export {
  AgentCapabilitiesSchema,
  ClientCapabilitiesSchema,
  InitializeRequestSchema,
  InitializeResponseSchema,
  ProtocolVersionSchema,
  type AgentCapabilities,
  type ClientCapabilities,
  type InitializeRequest,
  type InitializeResponse,
  type ProtocolVersion,
};
