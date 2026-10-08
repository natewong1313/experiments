import { ChatStateSchema, type ChatState } from "@experiments/protocol-schemas/ahp";
import { MAX_TURN_BYTES, checkBytes } from "../src/memory";

const CHUNK_BYTES = 65_536;

type ChunkRow = { chunk: number; data: ArrayBuffer };

export class DocumentBaseline {
  private readonly sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.sql = sql;
    sql.exec(
      "CREATE TABLE baseline_chunks (scope TEXT NOT NULL, id TEXT NOT NULL, chunk INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (scope, id, chunk))",
    );
  }

  read(scope: string, id: string): ChatState {
    const size = this.size(scope, id);

    if (size === 0) {
      throw new Error(`Missing stored document: ${scope}/${id}`);
    }

    checkBytes(size, MAX_TURN_BYTES, "Stored document exceeds the memory budget");

    const bytes = new Uint8Array(size);
    let offset = 0;

    for (const row of this.sql.exec<ChunkRow>(
      "SELECT chunk, data FROM baseline_chunks WHERE scope = ? AND id = ? ORDER BY chunk",
      scope,
      id,
    )) {
      bytes.set(new Uint8Array(row.data), offset);
      offset += row.data.byteLength;
    }

    const text = new TextDecoder().decode(bytes);

    return ChatStateSchema.parse(JSON.parse(text));
  }

  write(scope: string, id: string, value: ChatState, limit = MAX_TURN_BYTES): void {
    const text = JSON.stringify(value);
    const message = "Turn exceeds the memory budget";
    checkBytes(text.length, limit, message);
    const bytes = new TextEncoder().encode(text);
    checkBytes(bytes.byteLength, limit, message);
    let chunk = 0;

    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      const data = bytes.subarray(offset, offset + CHUNK_BYTES);

      const existing = this.sql
        .exec<ChunkRow>(
          "SELECT chunk, data FROM baseline_chunks WHERE scope = ? AND id = ? AND chunk = ?",
          scope,
          id,
          chunk,
        )
        .next().value;

      const previous = existing === void 0 ? void 0 : new Uint8Array(existing.data);

      const unchanged =
        previous !== void 0 &&
        previous.byteLength === data.byteLength &&
        data.every((byte, index) => byte === previous[index]);

      if (!unchanged) {
        this.sql.exec(
          "INSERT INTO baseline_chunks VALUES (?, ?, ?, ?) ON CONFLICT(scope, id, chunk) DO UPDATE SET data = excluded.data",
          scope,
          id,
          chunk,
          data,
        );
      }

      chunk++;
    }

    this.sql.exec(
      "DELETE FROM baseline_chunks WHERE scope = ? AND id = ? AND chunk >= ?",
      scope,
      id,
      chunk,
    );
  }

  size(scope: string, id?: string): number {
    const query =
      id === void 0
        ? "SELECT COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM baseline_chunks WHERE scope = ?"
        : "SELECT COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM baseline_chunks WHERE scope = ? AND id = ?";

    const bindings = id === void 0 ? [scope] : [scope, id];

    return this.sql.exec<{ bytes: number }>(query, ...bindings).one().bytes;
  }
}
