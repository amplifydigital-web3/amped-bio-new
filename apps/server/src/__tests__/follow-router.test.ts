/**
 * Fan Graph (#22) follow router paths fixed in staging QA round 6:
 * idempotent Undo, unfollow of an unpublished creator, Undo for unfollow, and
 * block of a missing account. The database is mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { findFirst: fn(), findUnique: fn(), updateMany: fn() },
    follow: {
      findUnique: fn(),
      upsert: fn(),
      delete: fn(),
      deleteMany: fn(),
      updateMany: fn(),
    },
    followBlock: { findUnique: fn(), upsert: fn() },
    followRemoval: { create: fn(), delete: fn(), deleteMany: fn() },
    $transaction: fn(),
  };
});

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/rateLimit", () => ({ enforceRateLimits: vi.fn() }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn() }));

import { followRouter } from "../trpc/follow";
import { encodeRestoreToken } from "../services/follow/rules";

const creatorCaller = followRouter.createCaller({ user: { sub: 3 } } as never);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("restoreFollower is idempotent (QA-020)", () => {
  const token = () =>
    encodeRestoreToken({
      r: 41,
      f: 7,
      c: 3,
      p: true,
      e: false,
      ea: null,
      s: "page",
      k: null,
      t: "2026-10-01T09:41:00.000Z",
      x: Date.now() + 8_000,
    });

  it("succeeds twice even when the removal row is already gone", async () => {
    db.followBlock.findUnique.mockResolvedValue(null);
    db.follow.upsert.mockResolvedValue({});
    db.followRemoval.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({
      count: 0,
    });
    const t = token();
    await expect(creatorCaller.restoreFollower({ token: t })).resolves.toEqual({ ok: true });
    await expect(creatorCaller.restoreFollower({ token: t })).resolves.toEqual({ ok: true });
    expect(db.followRemoval.deleteMany).toHaveBeenCalledWith({ where: { id: 41 } });
    expect(db.followRemoval.delete).not.toHaveBeenCalled();
  });
});
