/**
 * Creator Pool Broadcast (Build Board #1), phase 1.
 * Content check, Markdown subset, quota, fan-out claim, report pause, and the
 * send rules (invite gate, warn-only confirm, first-send review, idempotency).
 */
import fs from "fs";
import path from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  BROADCAST_FOOTER,
  BROADCAST_POLICY,
  broadcastLinks,
  broadcastPlainText,
  checkBroadcastContent,
  findBannedTerms,
  parseBroadcastBody,
} from "@repo/constants";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    broadcast: {
      count: fn(),
      findUnique: fn(),
      findUniqueOrThrow: fn(),
      findFirst: fn(),
      findMany: fn(),
      create: fn(),
      update: fn(),
      updateMany: fn(),
    },
    broadcastDelivery: { createMany: fn(), count: fn() },
    broadcastSenderStatus: { findUnique: fn(), upsert: fn() },
    creatorPool: { findFirst: fn() },
    user: { findUnique: fn() },
    $queryRaw: fn(),
    $transaction: fn(),
  };
});

vi.mock("@repo/database", () => ({
  prisma: db,
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    DbNull: null,
  },
}));

vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../services/S3Service", () => ({
  s3Service: { getFileUrl: (k: string) => `https://cdn/${k}` },
}));

import {
  BROADCAST_MAX_SEND_ATTEMPTS,
  checkReportThreshold,
  getQuota,
  processBroadcast,
  sweepBroadcasts,
} from "../services/broadcast";
import { broadcastCreatorRouter } from "../trpc/broadcast/creator";
import { broadcastsAdminRouter } from "../trpc/admin/broadcasts";
import { env } from "../env";

const envMock = env as { BROADCAST_INVITE_ONLY: boolean };

beforeEach(() => {
  vi.clearAllMocks();
  envMock.BROADCAST_INVITE_ONLY = true;
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof db) => unknown)(db) : Promise.all(arg as [])
  );
});

describe("content check (warn only)", () => {
  it("flags staking and return language on word boundaries", () => {
    const flags = checkBroadcastContent(
      "Big news",
      "Watch your rewards grow and stake more before the 14th."
    );
    expect(flags.map(f => f.phrase)).toEqual(["rewards grow", "stake more"]);
    expect(flags.every(f => f.field === "body")).toBe(true);
  });

  it("is case insensitive and normalizes Unicode", () => {
    expect(findBannedTerms("Our APY is up").map(f => f.phrase)).toEqual(["apy"]);
    // Full width letters normalize to ASCII under NFKC
    expect(findBannedTerms("ＡＰＹ").map(f => f.phrase)).toEqual(["apy"]);
  });

  it("does not flag words that only contain a term", () => {
    expect(findBannedTerms("I learned to investigate the moonlight")).toEqual([]);
    // A release called "new moon" is not price talk; "to the moon" is
    expect(findBannedTerms("The new moon recording is up")).toEqual([]);
    expect(findBannedTerms("REVO to the moon").map(f => f.phrase)).toEqual(["to the moon"]);
  });

  it("matches phrases across extra whitespace", () => {
    expect(findBannedTerms("stake\n  more").map(f => f.phrase)).toEqual(["stake more"]);
  });

  it("checks the title too", () => {
    expect(checkBroadcastContent("Guaranteed profit", "Hello")).toHaveLength(2);
  });

  it("keeps the fixed footer and policy wording", () => {
    expect(BROADCAST_FOOTER("Maya Lin")).toBe(
      "Maya Lin wrote this message. Amped.Bio delivers it and does not endorse it. Nothing in a broadcast is financial advice."
    );
    expect(findBannedTerms(BROADCAST_FOOTER("Maya Lin"))).toEqual([]);
    expect(BROADCAST_POLICY).toContain("Do not tell members to buy, hold or stake more.");
  });
});

describe("Markdown subset", () => {
  it("parses bold, italic, https links and line breaks only", () => {
    const [p1, p2] = parseBroadcastBody(
      "Hi **all**\nsee _this_\n\n[Stems](https://amped.bio/x) and <b>raw</b>"
    );
    expect(p1).toEqual([
      [
        { type: "text", text: "Hi " },
        { type: "bold", text: "all" },
      ],
      [
        { type: "text", text: "see " },
        { type: "italic", text: "this" },
      ],
    ]);
    expect(p2).toEqual([
      [
        { type: "link", text: "Stems", href: "https://amped.bio/x" },
        { type: "text", text: " and <b>raw</b>" },
      ],
    ]);
  });

  it("never turns a non https link into a link", () => {
    const tokens = parseBroadcastBody("[x](javascript:alert(1)) [y](http://a.b)").flat(2);
    expect(tokens.every(t => t.type === "text")).toBe(true);
    expect(broadcastLinks("[x](javascript:alert(1))")).toEqual([]);
  });

  it("makes a plain preview", () => {
    expect(broadcastPlainText("**Hi**\n\nthere [link](https://a.b)")).toBe("Hi there link");
  });
});

describe("quota", () => {
  it("allows 3 a day and 10 a week, counting only live statuses", async () => {
    db.broadcast.count.mockResolvedValueOnce(2).mockResolvedValueOnce(9);
    db.broadcastSenderStatus.findUnique.mockResolvedValue({
      firstApprovedAt: new Date(),
      pausedAt: null,
      invitedAt: new Date(),
    });
    const q = await getQuota(7);
    expect(q.leftToday).toBe(1);
    expect(q.nextSendReviewed).toBe(false);
    const where = db.broadcast.count.mock.calls[0][0].where;
    expect(where.status.in).toEqual(["IN_REVIEW", "QUEUED", "SENDING", "SENT"]);
  });

  it("weekly cap wins over the daily cap", async () => {
    db.broadcast.count.mockResolvedValueOnce(0).mockResolvedValueOnce(10);
    db.broadcastSenderStatus.findUnique.mockResolvedValue(null);
    const q = await getQuota(7);
    expect(q.leftToday).toBe(0);
    expect(q.nextSendReviewed).toBe(true);
  });
});

describe("fan-out", () => {
  it("skips a broadcast another run already claimed", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 0 });
    expect(await processBroadcast(1)).toBe("skipped");
    expect(db.broadcastDelivery.createMany).not.toHaveBeenCalled();
  });

  it("writes one delivery per member with skipDuplicates and marks it sent", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 1 });
    db.broadcast.findUnique.mockResolvedValue({ id: 5, poolId: 9, creatorUserId: 1 });
    db.$queryRaw.mockResolvedValue([{ userId: 2 }, { userId: 3 }]);
    db.broadcastDelivery.count.mockResolvedValue(2);
    expect(await processBroadcast(5)).toBe("sent");
    const call = db.broadcastDelivery.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data.map((d: { userId: number }) => d.userId)).toEqual([2, 3]);
    expect(db.broadcast.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT", recipientCount: 2 }),
      })
    );
  });

  it("counts each claim as an attempt and only claims under the cap (QA-034)", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 0 });
    await processBroadcast(5);
    expect(db.broadcast.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ sendAttempts: { lt: BROADCAST_MAX_SEND_ATTEMPTS } }),
      data: expect.objectContaining({ sendAttempts: { increment: 1 } }),
    });
  });

  it("leaves a failed run SENDING while attempts remain", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 1 });
    db.broadcast.findUnique.mockResolvedValue({
      id: 5,
      poolId: 9,
      creatorUserId: 1,
      sendAttempts: 2,
    });
    db.$queryRaw.mockRejectedValue(new Error("db down"));
    expect(await processBroadcast(5)).toBe("failed");
    expect(db.broadcast.update).not.toHaveBeenCalled();
  });

  it("marks the broadcast FAILED on the last attempt", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 1 });
    db.broadcast.findUnique.mockResolvedValue({
      id: 5,
      poolId: 9,
      creatorUserId: 1,
      sendAttempts: BROADCAST_MAX_SEND_ATTEMPTS,
    });
    db.$queryRaw.mockRejectedValue(new Error("db down"));
    expect(await processBroadcast(5)).toBe("failed");
    expect(db.broadcast.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({ status: "FAILED" }),
    });
  });

  it("the sweeper fails stale broadcasts that used every attempt and skips them", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 1 });
    db.broadcast.findMany.mockResolvedValue([]);
    await sweepBroadcasts();
    expect(db.broadcast.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: "SENDING",
        sendAttempts: { gte: BROADCAST_MAX_SEND_ATTEMPTS },
      }),
      data: expect.objectContaining({ status: "FAILED" }),
    });
    expect(db.broadcast.findMany.mock.calls[0][0].where.sendAttempts).toEqual({
      lt: BROADCAST_MAX_SEND_ATTEMPTS,
    });
  });
});

describe("report pause", () => {
  it("pauses at 3 reports on a small broadcast", async () => {
    db.broadcast.findUnique.mockResolvedValue({
      creatorUserId: 4,
      recipientCount: 50,
      _count: { reports: 3 },
    });
    expect(await checkReportThreshold(1)).toBe(true);
    expect(db.broadcastSenderStatus.upsert).toHaveBeenCalled();
  });

  it("needs 1% on a large broadcast", async () => {
    db.broadcast.findUnique.mockResolvedValue({
      creatorUserId: 4,
      recipientCount: 1000,
      _count: { reports: 9 },
    });
    expect(await checkReportThreshold(1)).toBe(false);
  });
});

describe("send", () => {
  const caller = broadcastCreatorRouter.createCaller({ user: { sub: 1 } } as never);
  const input = {
    chainId: "1",
    title: "New release",
    body: "It is out now.",
    idempotencyKey: "key-12345",
  };

  function ready({ invited = true, approved = true } = {}) {
    db.broadcast.findUnique.mockResolvedValue(null);
    db.creatorPool.findFirst.mockResolvedValue({ id: 9, name: "Tide Circle", poolAddress: "0x" });
    db.user.findUnique.mockResolvedValue({ email_verified: true, block: "no" });
    db.broadcastSenderStatus.findUnique.mockResolvedValue({
      invitedAt: invited ? new Date() : null,
      firstApprovedAt: approved ? new Date() : null,
      pausedAt: null,
    });
    db.broadcast.count.mockResolvedValue(0);
    db.$queryRaw.mockResolvedValue([{ n: 12 }]);
    db.broadcast.create.mockImplementation(({ data }: { data: { status: string } }) =>
      Promise.resolve({ id: 77, status: data.status })
    );
  }

  it("returns the first result for a repeated idempotency key", async () => {
    db.broadcast.findUnique.mockResolvedValue({ id: 3, status: "SENT" });
    expect(await caller.send(input)).toEqual({ id: 3, status: "SENT" });
    expect(db.broadcast.create).not.toHaveBeenCalled();
  });

  it("refuses an owner without an invite while invite only", async () => {
    ready({ invited: false });
    await expect(caller.send(input)).rejects.toThrow("invite only");
  });

  it("holds the first broadcast for review", async () => {
    ready({ approved: false });
    const res = await caller.send(input);
    expect(res.status).toBe("IN_REVIEW");
  });

  it("queues later broadcasts", async () => {
    ready();
    const res = await caller.send(input);
    expect(res.status).toBe("QUEUED");
  });

  // Verification grace (Rob, 2026-10-10)
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  it("lets a new unverified creator send", async () => {
    ready();
    db.user.findUnique.mockResolvedValue({
      email_verified: false,
      block: "no",
      created_at: daysAgo(3),
    });
    const res = await caller.send(input);
    expect(res.status).toBe("QUEUED");
  });

  it("asks an unverified creator to confirm after 30 days", async () => {
    ready();
    db.user.findUnique.mockResolvedValue({
      email_verified: false,
      block: "no",
      created_at: daysAgo(31),
    });
    await expect(caller.send(input)).rejects.toThrow("Confirm your email to send broadcasts.");
  });

  it("asks an unverified creator to confirm after 3 sends", async () => {
    ready();
    db.user.findUnique.mockResolvedValue({
      email_verified: false,
      block: "no",
      created_at: daysAgo(3),
    });
    // The lifetime count has no date filter; the quota counts do
    db.broadcast.count.mockImplementation(({ where }: { where: { createdAt?: unknown } }) =>
      Promise.resolve(where.createdAt ? 0 : 3)
    );
    await expect(caller.send(input)).rejects.toThrow("sent 3 broadcasts");
  });

  it("asks the creator to confirm flagged words, then sends with the flags stored", async () => {
    ready();
    const flagged = { ...input, body: "Stake more before Friday." };
    await expect(caller.send(flagged)).rejects.toThrow("broadcast word list");
    const res = await caller.send({ ...flagged, confirmFlags: true });
    expect(res.status).toBe("QUEUED");
    const data = db.broadcast.create.mock.calls[0][0].data;
    expect(data.flaggedTerms).toEqual([
      { phrase: "stake more", category: "solicitation", field: "body" },
    ]);
  });

  it("re-counts the quota under a lock before the insert (QA-022)", async () => {
    ready();
    // First read says one slot is left; a parallel send took it before the lock.
    db.broadcast.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3);
    await expect(caller.send(input)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.broadcast.create).not.toHaveBeenCalled();
    const lock = db.$queryRaw.mock.calls.find(c => String(c[0]).includes("FOR UPDATE"));
    expect(lock).toBeDefined();
  });

  it("refuses more than 5 links", async () => {
    ready();
    await expect(
      caller.send({
        ...input,
        body: "see [x](https://a.b) and [y](https://c.d) [1](https://1.io) [2](https://2.io) [3](https://3.io) [4](https://4.io)",
      })
    ).rejects.toThrow("5 links");
  });
});

describe("admin review races (QA-019)", () => {
  const admin = broadcastsAdminRouter.createCaller({ user: { sub: 2, role: "admin" } } as never);

  it("approve claims the row only while it is in review", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 0 });
    await expect(admin.approve({ id: 5 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.broadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5, status: "IN_REVIEW" } })
    );
    expect(db.broadcastSenderStatus.upsert).not.toHaveBeenCalled();
  });

  it("reject after another admin acted is a conflict", async () => {
    db.broadcast.updateMany.mockResolvedValue({ count: 0 });
    await expect(admin.reject({ id: 5, note: "Off topic" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(db.broadcast.findUnique).not.toHaveBeenCalled();
  });
});

describe("compliance copy check (spec 3.8, acceptance 17)", () => {
  // Every user-facing string in the broadcast and inbox UI is checked against
  // the word list. The policy text and the list itself live in packages/constants.
  const root = path.resolve(__dirname, "../../../..");
  const files = [
    ...fs
      .readdirSync(path.join(root, "apps/client/src/components/panels/broadcast"))
      .map(f => path.join(root, "apps/client/src/components/panels/broadcast", f)),
    path.join(root, "apps/client/src/components/shell/InboxButton.tsx"),
    path.join(root, "apps/admin/src/pages/AdminBroadcasts.tsx"),
  ];

  it.each(files.map(f => [path.relative(root, f), f]))("%s has no banned terms", (_name, file) => {
    const source = fs.readFileSync(file as string, "utf8");
    // Strip comments, then check string literals and JSX text
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const strings = [...code.matchAll(/"([^"\n]*)"|`([^`]*)`|>([^<>{}\n]+)</g)].map(
      m => m[1] ?? m[2] ?? m[3]
    );
    const hits = strings.flatMap(s => findBannedTerms(s).map(h => `${h.phrase} in "${s.trim()}"`));
    expect(hits).toEqual([]);
  });
});
