import { AhpErrorCodes } from "@microsoft/agent-host-protocol";
import {
  ResourceListResultSchema,
  ResourceReadResultSchema,
  ResourceResolveResultSchema,
} from "@experiments/protocol-schemas";
import { describe, expect } from "vitest";
import { expectRpcError, initialized, MUTATIONS, test } from "./client";

const file = process.env.AHP_FILE_URI;

const directory = process.env.AHP_DIRECTORY_URI;

const writable = process.env.AHP_WRITABLE_FILE_URI;

describe("resources", () => {
  test.skipIf(!file)("reads a fixture file", async ({ client }) => {
    const uri = file!;
    await initialized(client);

    const result = ResourceReadResultSchema.parse(await client.resourceRead({ uri }));

    expect(result.data.length).toBeGreaterThan(0);
  });

  test.skipIf(!file)("declares a supported encoding for read content", async ({ client }) => {
    const uri = file!;
    await initialized(client);

    const result = ResourceReadResultSchema.parse(await client.resourceRead({ uri }));

    expect(["utf-8", "base64"]).toContain(result.encoding);
  });

  test.skipIf(!file)("resolves a fixture file", async ({ client }) => {
    const uri = file!;
    await initialized(client);

    const result = ResourceResolveResultSchema.parse(await client.resourceResolve({ uri }));

    expect(result.uri.startsWith("file://")).toBe(true);
    expect(result.type).toBe("file");
  });

  test.skipIf(!file)("reports a nonnegative file size when present", async ({ client }) => {
    const uri = file!;
    await initialized(client);

    const result = ResourceResolveResultSchema.parse(await client.resourceResolve({ uri }));

    const { size } = result;

    if (!size) {
      return;
    }

    expect(Number.isSafeInteger(size)).toBe(true);
    expect(size).toBeGreaterThanOrEqual(0);
  });

  test.skipIf(!directory)("lists a fixture directory", async ({ client }) => {
    const uri = directory!;
    await initialized(client);

    const result = ResourceListResultSchema.parse(await client.resourceList({ uri }));

    expect(Array.isArray(result.entries)).toBe(true);
  });

  test.skipIf(!directory)("returns names and kinds for directory entries", async ({ client }) => {
    const uri = directory!;
    await initialized(client);

    const result = ResourceListResultSchema.parse(await client.resourceList({ uri }));

    for (const entry of result.entries) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(["file", "directory"]).toContain(entry.type);
    }
  });

  test.skipIf(!directory)("resolves a fixture directory as a directory", async ({ client }) => {
    const uri = directory!;
    await initialized(client);

    const result = ResourceResolveResultSchema.parse(await client.resourceResolve({ uri }));

    expect(result.type).toBe("directory");
  });

  test.skipIf(!directory)("rejects resolution of a missing child", async ({ client }) => {
    const uri = directory!;
    await initialized(client);
    const missing = `${uri.replace(/\/$/, "")}/ahp-conformance-missing-${crypto.randomUUID()}`;

    const error = await expectRpcError(
      () => client.resourceResolve({ uri: missing }),
      AhpErrorCodes.NotFound,
    );

    expect(error.code).toBe(AhpErrorCodes.NotFound);
  });

  test.skipIf(!file)("resolves a nonexistent resource with NotFound", async ({ client }) => {
    const base = file!;
    const uri = `${base}-conformance-missing-${crypto.randomUUID()}`;
    await initialized(client);

    const error = await expectRpcError(
      () => client.resourceResolve({ uri }),
      AhpErrorCodes.NotFound,
    );

    expect(error.code).toBe(AhpErrorCodes.NotFound);
  });

  test.skipIf(!writable || !MUTATIONS)(
    "preserves a fixture file across a write and restore",
    async ({ client }) => {
      const uri = writable!;
      await initialized(client);
      const original = await client.resourceRead({ uri });
      const validated = ResourceReadResultSchema.parse(original);

      try {
        const marker = `AHP conformance ${crypto.randomUUID()}`;
        const data = validated.encoding === "base64" ? btoa(marker) : marker;
        await client.resourceWrite({ uri, data, encoding: original.encoding });

        const written = ResourceReadResultSchema.parse(
          await client.resourceRead({ uri, encoding: original.encoding }),
        );

        expect(written.data).toBe(data);
      } finally {
        await client.resourceWrite({
          uri,
          data: original.data,
          encoding: original.encoding,
        });
      }
    },
  );
});
