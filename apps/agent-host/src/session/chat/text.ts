import {
  ResponsePartKind as AHPResponsePartKind,
  ToolCallStatus as AHPToolCallStatus,
} from "@microsoft/agent-host-protocol";
import type { ResponsePart as AHPResponsePart } from "@microsoft/agent-host-protocol";

/** The maximum size of one text segment, in UTF-8 bytes. */
export const SEGMENT_BYTES = 16_384;

// These thresholds mark the first code points that need two, three, and four UTF-8 bytes.
const TWO_BYTE_START = 0x80;
const THREE_BYTE_START = 0x8_00;
const FOUR_BYTE_START = 0x1_00_00;
const TWO_BYTES = 2;
const THREE_BYTES = 3;
const FOUR_BYTES = 4;
// A code point at or above `FOUR_BYTE_START` uses a surrogate pair of two UTF-16 code units.
const SURROGATE_PAIR_UNITS = 2;
const HIGH_SURROGATE_START = 0xd8_00;
const LOW_SURROGATE_START = 0xdc_00;
const LAST = -1;

/** A piece of text and its size in UTF-8 bytes. */
export type TextChunk = { text: string; bytes: number };

/** A response part without its streamed text, and that text. */
export type SplitPart = { payload: AHPResponsePart; text: string | undefined };

/**
 * Returns the UTF-8 byte count of a code point. UTF-8 encoding replaces a lone surrogate with
 * U+FFFD, which takes three bytes.
 */
function codePointBytes(codePoint: number): number {
  if (codePoint < TWO_BYTE_START) {
    return 1;
  }

  if (codePoint < THREE_BYTE_START) {
    return TWO_BYTES;
  }

  return codePoint < FOUR_BYTE_START ? THREE_BYTES : FOUR_BYTES;
}

/**
 * Splits `text` into chunks of at most `SEGMENT_BYTES` UTF-8 bytes. The first chunk has at most
 * `firstCapacity` bytes, and it can be empty. The split points are code point boundaries, so a
 * surrogate pair stays in one chunk.
 */
export function splitText(text: string, firstCapacity: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  let capacity = firstCapacity;
  let start = 0;
  let bytes = 0;
  let index = 0;

  while (index < text.length) {
    const codePoint = text.codePointAt(index) ?? 0;
    const size = codePointBytes(codePoint);

    if (bytes + size > capacity) {
      chunks.push({ text: text.slice(start, index), bytes });
      start = index;
      bytes = 0;
      capacity = SEGMENT_BYTES;
    }

    bytes += size;
    index += codePoint < FOUR_BYTE_START ? 1 : SURROGATE_PAIR_UNITS;
  }

  chunks.push({ text: text.slice(start), bytes });

  return chunks;
}

/**
 * Separates the streamed text of a part from its payload. Markdown and reasoning parts stream
 * `content`, and a streaming tool call streams `partialInput`.
 * The payload keeps that field as a trailing high surrogate or an empty string.
 * SQLite text cannot store a lone surrogate, but JSON can.
 * Holding the high surrogate preserves characters whose surrogate pairs span two deltas.
 */
export function splitPart(part: AHPResponsePart): SplitPart {
  if (part.kind === AHPResponsePartKind.Markdown || part.kind === AHPResponsePartKind.Reasoning) {
    const { held, text } = holdSurrogate(part.content);

    return { payload: { ...part, content: held }, text };
  }

  if (part.kind === AHPResponsePartKind.ToolCall) {
    const { toolCall } = part;

    if (toolCall.status === AHPToolCallStatus.Streaming && toolCall.partialInput !== undefined) {
      const { held, text } = holdSurrogate(toolCall.partialInput);
      const payload = { ...part, toolCall: { ...toolCall, partialInput: held } };

      return { payload, text };
    }
  }

  return { payload: part, text: undefined };
}

/** Returns true if the payload has a field for streamed text. */
export function hasText(payload: AHPResponsePart): boolean {
  return splitPart(payload).text !== undefined;
}

/** Puts the stored text before the held code unit in the text field of a payload. */
export function joinText(payload: AHPResponsePart, text: string): AHPResponsePart {
  if (
    payload.kind === AHPResponsePartKind.Markdown ||
    payload.kind === AHPResponsePartKind.Reasoning
  ) {
    return { ...payload, content: text + payload.content };
  }

  if (payload.kind === AHPResponsePartKind.ToolCall) {
    const { toolCall } = payload;

    if (toolCall.status === AHPToolCallStatus.Streaming && toolCall.partialInput !== undefined) {
      return { ...payload, toolCall: { ...toolCall, partialInput: text + toolCall.partialInput } };
    }
  }

  return payload;
}

/** Separates a final high surrogate from the text. */
function holdSurrogate(text: string): { held: string; text: string } {
  const last = text.charCodeAt(text.length - 1);

  return last >= HIGH_SURROGATE_START && last < LOW_SURROGATE_START
    ? { held: text.slice(LAST), text: text.slice(0, LAST) }
    : { held: "", text };
}
