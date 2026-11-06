import { beforeEach, describe, expect, it, vi } from "vitest";

const refreshDelete = vi.fn(async () => ({ count: 1 }));
const accessDelete = vi.fn(async () => ({ count: 1 }));

vi.mock("@repo/database", () => ({
  prisma: {
    oauthRefreshToken: { deleteMany: refreshDelete },
    oauthAccessToken: { deleteMany: accessDelete },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

const { revokeOAuthOnBan } = await import("../utils/banHooks");

describe("revokeOAuthOnBan", () => {
  beforeEach(() => {
    refreshDelete.mockClear();
    accessDelete.mockClear();
  });

  it("deletes the OAuth tokens of a banned account", async () => {
    await revokeOAuthOnBan({ id: "42", banned: true });
    expect(refreshDelete).toHaveBeenCalledWith({ where: { userId: 42 } });
    expect(accessDelete).toHaveBeenCalledWith({ where: { userId: 42 } });
  });

  it("leaves tokens alone for any other update", async () => {
    await revokeOAuthOnBan({ id: "42", banned: false });
    await revokeOAuthOnBan({ id: "42" });
    await revokeOAuthOnBan({ id: "not-a-number", banned: true });
    expect(refreshDelete).not.toHaveBeenCalled();
    expect(accessDelete).not.toHaveBeenCalled();
  });
});
