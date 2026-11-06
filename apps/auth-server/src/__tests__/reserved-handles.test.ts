/**
 * Reserved handles (Build Board D2). This process serves sign up and
 * /update-user at auth.amped.bio, so its hooks and generator are tested here
 * as well as in apps/server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  reservedHandle: { findMany: vi.fn() },
}));
vi.mock("../services/DB", () => ({ prisma: db }));

import { seedAdminRows } from "@repo/constants";
import { checkSignUpHandle, refuseHandleUpdate } from "../utils/handleHooks";
import { generateUniqueHandle, processEmailToUniqueHandle } from "../utils/onelink-generator";
import { resetReservedCache } from "../utils/reservedHandles";

const tableRows = (extra: { word: string; category: string; expiresAt?: Date | null }[] = []) => [
  ...seedAdminRows().map(row => ({ ...row, id: Buffer.alloc(16) })),
  ...extra.map(row => ({
    id: Buffer.alloc(16),
    kind: "EXACT",
    assignedUserId: null,
    expiresAt: null,
    ...row,
  })),
];

beforeEach(() => {
  resetReservedCache();
  db.reservedHandle.findMany.mockResolvedValue(tableRows());
});

describe("sign up hook", () => {
  it("refuses reserved and malformed handles", async () => {
    await expect(checkSignUpHandle("admin")).rejects.toMatchObject({
      body: { code: "INVALID_HANDLE", message: "This handle is reserved" },
    });
    await expect(checkSignUpHandle("support")).rejects.toMatchObject({
      body: { code: "INVALID_HANDLE" },
    });
    await expect(checkSignUpHandle("A B")).rejects.toMatchObject({
      body: { code: "INVALID_HANDLE", message: "This handle is not valid" },
    });
  });

  it("accepts and lowercases a free handle", async () => {
    await expect(checkSignUpHandle("MayaLin")).resolves.toBe("mayalin");
  });
});

describe("admin tier from the table (RH2)", () => {
  it("refuses a word an admin reserved, within 5 s", async () => {
    await expect(checkSignUpHandle("northlight")).resolves.toBe("northlight");
    resetReservedCache();
    db.reservedHandle.findMany.mockResolvedValue(
      tableRows([{ word: "northlight", category: "BRAND" }])
    );
    await expect(checkSignUpHandle("northlight")).rejects.toMatchObject({
      body: { code: "INVALID_HANDLE", message: "This handle is reserved" },
    });
  });

  it("falls back to the seed when the table cannot be read", async () => {
    resetReservedCache();
    db.reservedHandle.findMany.mockRejectedValue(new Error("db down"));
    await expect(checkSignUpHandle("support")).rejects.toMatchObject({
      body: { code: "INVALID_HANDLE" },
    });
  });

  it("ignores a hold past its end date", async () => {
    db.reservedHandle.findMany.mockResolvedValue(
      tableRows([{ word: "dealhold", category: "HOLD", expiresAt: new Date(Date.now() - 1000) }])
    );
    await expect(checkSignUpHandle("dealhold")).resolves.toBe("dealhold");
  });
});

describe("update user hook", () => {
  it("refuses any handle in the update", () => {
    expect(() => refuseHandleUpdate({ handle: "admin" })).toThrow();
    expect(() => refuseHandleUpdate({ name: "Maya" })).not.toThrow();
  });
});

describe("generator", () => {
  beforeEach(() => db.user.findFirst.mockResolvedValue(null));

  it("never returns a reserved handle from an email", async () => {
    expect(await processEmailToUniqueHandle("support@example.com")).toMatch(/^support\d+$/);
    expect(await processEmailToUniqueHandle("pools@example.com")).toMatch(/^pools\d+$/);
  });

  it("leaves a reserved prefix", async () => {
    expect(await processEmailToUniqueHandle("amped-joe@example.com")).toBe("joe");
    expect(await generateUniqueHandle("_foo")).toBe("foo");
  });
});
