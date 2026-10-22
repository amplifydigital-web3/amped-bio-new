/**
 * Tests for withNumericIdCoercion — the Prisma extension the Better Auth adapter
 * runs on. A fake client captures the extension so no database is needed.
 */
import { describe, it, expect } from "vitest";
import { withNumericIdCoercion, PrismaClient } from "@repo/database";

type AllOperations = (params: {
  model: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}) => Promise<unknown>;

const captureAllOperations = (): AllOperations => {
  let handler: AllOperations | undefined;
  const fakeClient = {
    $extends: (extension: { query: { $allModels: { $allOperations: AllOperations } } }) => {
      handler = extension.query.$allModels.$allOperations;
    },
  };
  withNumericIdCoercion(fakeClient as unknown as PrismaClient);
  return handler!;
};

describe("withNumericIdCoercion", () => {
  const allOperations = captureAllOperations();
  const idBytes = new Uint8Array([1, 161, 99, 207, 244, 113, 115, 57, 135, 43, 146, 163, 107, 44, 232, 199]);
  const idBase64 = Buffer.from(idBytes).toString("base64");

  it("returns Bytes ids as base64 so String(id) can be sent back to Prisma", async () => {
    const result = (await allOperations({
      model: "OauthConsent",
      args: { where: { clientId: "client" } },
      query: async () => ({ id: idBytes, userId: 1, createdAt: new Date(0) }),
    })) as Record<string, unknown>;

    expect(result.id).toBe(idBase64);
    expect(String(result.id)).toBe(idBase64);
    expect(result.createdAt).toEqual(new Date(0));
  });

  it("converts Bytes in lists and nested relations", async () => {
    const result = (await allOperations({
      model: "OauthAccessToken",
      args: {},
      query: async () => [{ id: idBytes, refreshId: null, client: { id: idBytes } }],
    })) as Array<Record<string, any>>;

    expect(result[0]?.id).toBe(idBase64);
    expect(result[0]?.refreshId).toBeNull();
    expect(result[0]?.client.id).toBe(idBase64);
  });

  it("still converts numeric string ids for Int columns", async () => {
    let received: unknown;
    await allOperations({
      model: "OauthConsent",
      args: { where: { id: idBase64, userId: "42" } },
      query: async args => {
        received = args;
        return null;
      },
    });

    expect(received).toEqual({ where: { id: idBase64, userId: 42 } });
  });
});
