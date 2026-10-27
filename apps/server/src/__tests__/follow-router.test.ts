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
import { decodeRestoreToken, encodeRestoreToken } from "../services/follow/rules";

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

describe("Undo for Unfollow (QA-033)", () => {
  const fan = followRouter.createCaller({ user: { sub: 7 } } as never);
  const followedAt = new Date("2026-09-01T10:00:00.000Z");
  const row = {
    id: 11,
    follower_id: 7,
    creator_id: 3,
    show_publicly: true,
    email_updates: true,
    email_updates_at: new Date("2026-09-02T10:00:00.000Z"),
    source: "pool",
    campaign_id: null,
    created_at: followedAt,
  };

  async function unfollowToken() {
    db.user.findFirst.mockResolvedValue({ id: 3, name: "Maya", handle: "maya" });
    db.follow.findUnique.mockResolvedValue(row);
    db.follow.delete.mockResolvedValue({});
    db.followRemoval.create.mockResolvedValue({ id: 55 });
    const res = await fan.unfollow({ handle: "maya" });
    return res.restoreToken!;
  }

  it("unfollow returns a token that carries the original follow", async () => {
    const token = await unfollowToken();
    expect(decodeRestoreToken(token)).toMatchObject({
      u: "unfollow",
      r: 55,
      f: 7,
      c: 3,
      p: true,
      e: true,
      s: "pool",
      t: followedAt.toISOString(),
    });
  });

  it("returns no token when there was nothing to unfollow", async () => {
    db.user.findFirst.mockResolvedValue({ id: 3, name: "Maya", handle: "maya" });
    db.follow.findUnique.mockResolvedValue(null);
    expect(await fan.unfollow({ handle: "maya" })).toEqual({
      following: false,
      restoreToken: null,
    });
  });

  it("undoUnfollow restores the follow with its settings and date", async () => {
    const token = await unfollowToken();
    db.followBlock.findUnique.mockResolvedValue(null);
    db.follow.upsert.mockResolvedValue({});
    db.followRemoval.deleteMany.mockResolvedValue({ count: 1 });
    expect(await fan.undoUnfollow({ token })).toEqual({ following: true });
    expect(db.follow.upsert.mock.calls[0][0].create).toMatchObject({
      follower_id: 7,
      creator_id: 3,
      show_publicly: true,
      email_updates: true,
      source: "pool",
      created_at: followedAt,
    });
    expect(db.followRemoval.deleteMany).toHaveBeenCalledWith({ where: { id: 55 } });
  });

  it("refuses another account's token and a Remove follower token", async () => {
    const token = await unfollowToken();
    const other = followRouter.createCaller({ user: { sub: 8 } } as never);
    await expect(other.undoUnfollow({ token })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // The creator cannot replay the fan's token through restoreFollower
    await expect(creatorCaller.restoreFollower({ token })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(db.follow.upsert).not.toHaveBeenCalled();
  });

  it("refuses when the creator blocked the fan in the meantime", async () => {
    const token = await unfollowToken();
    db.followBlock.findUnique.mockResolvedValue({ creator_id: 3, user_id: 7 });
    await expect(fan.undoUnfollow({ token })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.follow.upsert).not.toHaveBeenCalled();
  });
});

describe("blockFollower checks the account exists (QA-033)", () => {
  it("throws NOT_FOUND before writing anything", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(creatorCaller.blockFollower({ userId: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(db.followBlock.upsert).not.toHaveBeenCalled();
    expect(db.follow.deleteMany).not.toHaveBeenCalled();
  });

  it("blocks an existing account", async () => {
    db.user.findUnique.mockResolvedValue({ id: 7 });
    db.follow.deleteMany.mockResolvedValue({ count: 0 });
    db.followBlock.upsert.mockResolvedValue({});
    expect(await creatorCaller.blockFollower({ userId: 7 })).toEqual({ ok: true });
    expect(db.followBlock.upsert).toHaveBeenCalled();
  });
});
