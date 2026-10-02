// Chunked text storage on Durable Object SQLite.
// Turn documents have no protocol size limit, so chunking keeps rows under
// SQLite's 2 MB row limit and makes partial rewrites cheap.
// Values come from trusted producers and are not re-validated on read.
import type { ChatState, Turn } from "@experiments/protocol-schemas/ahp";

const CHUNK_BYTES = 65_536;

type ChunkRow = { chunk: number; data: ArrayBuffer };

type JsonDocument = ChatState | Turn;

class JsonDocuments {
  private readonly sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.sql = sql;
  }

  read<T extends JsonDocument>(scope: string, id: string): T {
    const rows = this.chunks(scope, id);

    if (rows.length === 0) {
      throw new Error(`Missing stored document: ${scope}/${id}`);
    }

    let size = 0;

    for (const row of rows) {
      size += row.data.byteLength;
    }

    const bytes = new Uint8Array(size);
    let offset = 0;

    for (const row of rows) {
      bytes.set(new Uint8Array(row.data), offset);
      offset += row.data.byteLength;
    }

    // SAFETY: Every stored document is produced by write<T> from the same typed owner.
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }

  write(scope: string, id: string, value: JsonDocument): void {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const previous = this.chunks(scope, id);
    let chunk = 0;

    for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
      const data = bytes.slice(offset, offset + CHUNK_BYTES);
      const existing = previous.at(chunk);

      const unchanged =
        existing !== void 0 &&
        existing.data.byteLength === data.byteLength &&
        data.every(
          (byte, index) => byte === new Uint8Array(existing.data)[index],
        );

      if (!unchanged) {
        this.sql.exec(
          "INSERT INTO document_chunks VALUES (?, ?, ?, ?) ON CONFLICT(scope, id, chunk) DO UPDATE SET data = excluded.data",
          scope,
          id,
          chunk,
          data.buffer,
        );
      }

      chunk++;
    }

    if (chunk < previous.length) {
      this.sql.exec(
        "DELETE FROM document_chunks WHERE scope = ? AND id = ? AND chunk >= ?",
        scope,
        id,
        chunk,
      );
    }
  }

  remove(scope: string, id: string): void {
    this.sql.exec(
      "DELETE FROM document_chunks WHERE scope = ? AND id = ?",
      scope,
      id,
    );
  }

  removeScope(scope: string): void {
    this.sql.exec("DELETE FROM document_chunks WHERE scope = ?", scope);
  }

  private chunks(scope: string, id: string): ChunkRow[] {
    return this.sql
      .exec<ChunkRow>(
        "SELECT chunk, data FROM document_chunks WHERE scope = ? AND id = ? ORDER BY chunk",
        scope,
        id,
      )
      .toArray();
  }
}

export { JsonDocuments };
