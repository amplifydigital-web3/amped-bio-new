/**
 * Stake rules pilot admin API (Build Board #21, spec 6): admin.settings.getStakeKindsAllowlist
 * and setStakeKindsAllowlist. Admin only access, input validation, and the handles view.
 * The database and the engine's allowlist store are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  siteSettings: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  user: { findMany: vi.fn() },
}));

const store = vi.hoisted(() => ({
  readStakeKindsAllowlist: vi.fn(),
  setStakeKindsAllowlist: vi.fn(),
}));

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../services/access/engine", () => ({
  readStakeKindsAllowlist: store.readStakeKindsAllowlist,
  setStakeKindsAllowlist: store.setStakeKindsAllowlist,
  parseStakeKindsAllowlist: (list: string) =>
    list
      .split(",")
      .map(value => value.trim())
      .filter(value => /^\d+$/.test(value))
      .map(Number)
      .filter(id => id > 0),
}));

import { settingsRouter } from "../trpc/admin/settings";

const admin = () => settingsRouter.createCaller({ user: { sub: 1, role: "admin" } } as never);
const member = () => settingsRouter.createCaller({ user: { sub: 7, role: "user" } } as never);

beforeEach(() => {
  vi.clearAllMocks();
  store.readStakeKindsAllowlist.mockResolvedValue({ value: "10, 3,10,x", source: "setting" });
  store.setStakeKindsAllowlist.mockResolvedValue({ value: "", source: "setting" });
  db.user.findMany.mockResolvedValue([{ id: 10, handle: "maya" }]);
});

describe("admin only", () => {
  it("refuses a signed in member who is not an admin, for reads and writes", async () => {
    await expect(member().getStakeKindsAllowlist()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member().setStakeKindsAllowlist({ userIds: [10] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(store.setStakeKindsAllowlist).not.toHaveBeenCalled();
  });

  it("refuses a signed out caller", async () => {
    const anon = settingsRouter.createCaller({ user: null } as never);
    await expect(anon.setStakeKindsAllowlist({ userIds: null })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(store.setStakeKindsAllowlist).not.toHaveBeenCalled();
  });
});

describe("setStakeKindsAllowlist", () => {
  it("saves the ids with the admin's id for the audit log", async () => {
    await expect(admin().setStakeKindsAllowlist({ userIds: [10, 3] })).resolves.toEqual({
      ok: true,
    });
    expect(store.setStakeKindsAllowlist).toHaveBeenCalledWith([10, 3], 1);
  });

  it("passes null through to go back to the environment", async () => {
    await admin().setStakeKindsAllowlist({ userIds: null });
    expect(store.setStakeKindsAllowlist).toHaveBeenCalledWith(null, 1);
  });

  it.each([
    [[0]],
    [[-3]],
    [[1.5]],
    [[2_147_483_648]],
    [Array.from({ length: 501 }, (_, i) => i + 1)],
  ])("refuses invalid ids %#", async userIds => {
    await expect(admin().setStakeKindsAllowlist({ userIds })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(store.setStakeKindsAllowlist).not.toHaveBeenCalled();
  });
});

describe("getStakeKindsAllowlist", () => {
  it("reads fresh, drops bad and repeated ids, and marks ids with no user", async () => {
    const view = await admin().getStakeKindsAllowlist();
    expect(store.readStakeKindsAllowlist).toHaveBeenCalledWith({ fresh: true });
    expect(view.userIds).toEqual([10, 3]);
    expect(view.source).toBe("setting");
    expect(view.creators).toEqual([
      { id: 10, handle: "maya", found: true },
      { id: 3, handle: null, found: false },
    ]);
  });

  it("does not query users for an empty list", async () => {
    store.readStakeKindsAllowlist.mockResolvedValue({ value: "", source: "environment" });
    const view = await admin().getStakeKindsAllowlist();
    expect(view).toMatchObject({ userIds: [], creators: [], source: "environment" });
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
