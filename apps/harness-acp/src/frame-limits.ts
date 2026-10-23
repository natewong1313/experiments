/**
 * Limits text in one update to this many UTF-16 code units.
 * JSON escaping uses at most 6 bytes per code unit. This leaves room for other fields within
 * the 1 MiB frame limit of the transports.
 */
const MAX_TEXT_LENGTH = 65_536;

/**
 * Limits serialized raw tool values in one update to this many UTF-16 code units.
 * Each code unit uses at most 3 UTF-8 bytes. Bounded text and a bounded raw value fit together within the 1 MiB frame limit.
 */
const MAX_RAW_LENGTH = 65_536;

/**
 * Splits `text` into chunks of at most `MAX_TEXT_LENGTH` code units without splitting a
 * surrogate pair. Empty text gives one empty chunk.
 */
export function textChunks(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  do {
    let end = Math.min(start + MAX_TEXT_LENGTH, text.length);

    if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) {
      end -= 1;
    }

    chunks.push(text.slice(start, end));
    start = end;
  } while (start < text.length);

  return chunks;
}

/** Returns the end of `text` that fits in one update, without a split surrogate pair. */
export function textTail(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }

  const start = text.length - MAX_TEXT_LENGTH;

  return isLowSurrogate(text.charCodeAt(start)) ? text.slice(start + 1) : text.slice(start);
}

/**
 * Returns `value` if its JSON fits in one update, otherwise undefined. A value without a JSON
 * form, such as a BigInt or a cycle, is undefined too.
 */
export function boundedRaw(value: unknown): unknown {
  try {
    return (JSON.stringify(value)?.length ?? 0) <= MAX_RAW_LENGTH ? value : undefined;
  } catch {
    return undefined;
  }
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd8_00 && code <= 0xdb_ff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc_00 && code <= 0xdf_ff;
}
