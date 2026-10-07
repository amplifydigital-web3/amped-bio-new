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

describe("a fan can leave a creator who unpublished (QA-021)", () => {
  const fan = followRouter.createCaller({ user: { sub: 7 } } as never);
  const unpublished = { id: 3, name: "Maya", handle: "maya", show_follower_count: true };

  it("unfollow looks the creator up by handle only", async () => {
    db.user.findFirst.mockResolvedValue(unpublished);
    db.follow.findUnique.mockResolvedValue({
      id: 11,
      follower_id: 7,
      creator_id: 3,
      show_publicly: false,
      email_updates: false,
      email_updates_at: null,
      source: "page",
      campaign_id: null,
      created_at: new Date(),
    });
    db.follow.delete.mockResolvedValue({});
    await expect(fan.unfollow({ handle: "maya" })).resolves.toMatchObject({ following: false });
    expect(db.user.findFirst.mock.calls[0][0].where).toEqual({ handle: "maya" });
    expect(db.follow.delete).toHaveBeenCalledWith({ where: { id: 11 } });
  });

  it("settings update looks the creator up by handle only", async () => {
    db.user.findFirst.mockResolvedValue(unpublished);
    db.follow.updateMany.mockResolvedValue({ count: 1 });
    await expect(fan.update({ handle: "maya", emailUpdates: false })).resolves.toEqual({
      ok: true,
    });
    expect(db.user.findFirst.mock.calls[0][0].where).toEqual({ handle: "maya" });
  });

  it("follow still needs a published page", async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(fan.follow({ handle: "maya" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.user.findFirst.mock.calls[0][0].where).toEqual({
      handle: "maya",
      page_status: "PUBLISHED",
      block: "no",
    });
  });
});
