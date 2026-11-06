/**
 * Reserved handles (Build Board D2): handle.checkAvailability answers reserved
 * or taken without naming the tier, is limited per IP, and handle.redeem and
 * user.publishPage refuse reserved words.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), count: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
  userOnboarding: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@repo/database", () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {} },
}));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
vi.mock("../trpc/trackingPixels", () => ({ getPublicTrackingPixels: vi.fn(async () => null) }));
vi.mock("../services/rnsIdentity", () => ({
  computeRnsIdentity: vi.fn(async () => ({ identity: null })),
  parseRnsDisplay: vi.fn(() => ({})),
  rnsIdBlockOptions: vi.fn(() => ({ attributes: [], visible: false })),
}));

import handleRouter from "../trpc/handle";
import { publishPage } from "../services/pagePublish";

let ipCounter = 0;
function caller(sub?: number, ip?: string) {
  const address = ip ?? `203.0.113.${(ipCounter++ % 250) + 1}`;
  const req = { headers: {}, socket: { remoteAddress: address } };
  return handleRouter.createCaller({ user: sub === undefined ? undefined : { sub }, req } as never);
}

describe("handle.checkAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.user.count.mockResolvedValue(0);
  });

  it("answers reserved for a system word and still looks up accounts", async () => {
    const result = await caller().checkAvailability({ handle: "pools" });
    expect(result).toEqual({ available: false, handle: "pools", reason: "reserved" });
    expect(db.user.count).toHaveBeenCalledTimes(1);
  });

  it("answers reserved for a seeded company word and a trust prefix", async () => {
    expect(await caller().checkAvailability({ handle: "amped" })).toMatchObject({
      available: false,
      reason: "reserved",
    });
    expect(await caller().checkAvailability({ handle: "amped-shop" })).toMatchObject({
      available: false,
      reason: "reserved",
    });
  });

  it("answers taken when an account holds the handle", async () => {
    db.user.count.mockResolvedValue(1);
    expect(await caller().checkAvailability({ handle: "mayalin" })).toEqual({
      available: false,
      handle: "mayalin",
      reason: "taken",
    });
  });

  it("answers available for a free word", async () => {
    expect(await caller().checkAvailability({ handle: "mayalin" })).toEqual({
      available: true,
      handle: "mayalin",
      reason: null,
    });
  });

  it("limits one IP to 60 checks a minute", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < 60; i++)
      await caller(undefined, ip).checkAvailability({ handle: "mayalin" });
    await expect(
      caller(undefined, ip).checkAvailability({ handle: "mayalin" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("handle.redeem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a reserved word before writing", async () => {
    await expect(caller(7).redeem({ newHandle: "support" })).rejects.toThrow(
      "This handle is reserved"
    );
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("writes a free handle", async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.update.mockResolvedValue({ id: 7 });
    await expect(caller(7).redeem({ newHandle: "mayalin" })).resolves.toMatchObject({
      success: true,
      handle: "mayalin",
    });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { handle: "mayalin" } })
    );
  });
});

describe("user.publishPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
    db.user.findUnique.mockResolvedValue({ handle: "user4821", page_status: "UNPUBLISHED" });
  });

  it("refuses to publish at a reserved word", async () => {
    await expect(publishPage(7, "explore")).rejects.toThrow("This handle is reserved");
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
