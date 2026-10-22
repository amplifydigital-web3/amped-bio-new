/**
 * QA-041: an unpublished page (a fan account made from Follow) reads as not
 * found to everyone except its owner, who must still load it in the editor.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  creatorPool: { findFirst: vi.fn() },
  theme: { findUnique: vi.fn() },
  block: { findMany: vi.fn() },
}));

vi.mock("@repo/database", () => ({ prisma: db }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
vi.mock("../trpc/trackingPixels", () => ({ getPublicTrackingPixels: vi.fn(async () => null) }));
vi.mock("../services/rnsIdentity", () => ({
  computeRnsIdentity: vi.fn(async () => ({ identity: null })),
  parseRnsDisplay: vi.fn(() => ({})),
  rnsIdBlockOptions: vi.fn(() => ({ attributes: [], visible: false })),
}));

import handleRouter from "../trpc/handle";

const OWNER_ID = 42;

function fanAccount(page_status: "PUBLISHED" | "UNPUBLISHED") {
  return {
    id: OWNER_ID,
    handle: "jordan-ellis-4821",
    name: "Jordan",
    revo_name: null,
    rns_display: null,
    description: null,
    image: null,
    image_file_id: null,
    theme: 1,
    page_status,
    wallet: null,
    created_at: new Date("2026-03-14T10:00:00Z"),
  };
}

function callerFor(sub?: number) {
  const user = sub === undefined ? undefined : { sub };
  return handleRouter.createCaller({ user } as never);
}

describe("handle.getHandle join month", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.theme.findUnique.mockResolvedValue({ id: 1, name: "Default", config: null });
    db.block.findMany.mockResolvedValue([]);
  });

  it("leaves the server only when a visible RNS ID block asks for it", async () => {
    const { rnsIdBlockOptions } = await import("../services/rnsIdentity");
    db.user.findFirst.mockResolvedValue(fanAccount("PUBLISHED"));
    (rnsIdBlockOptions as any).mockReturnValue({ attributes: [], visible: false });
    const hidden = await callerFor(OWNER_ID).getHandle({ handle: "jordan-ellis-4821" });
    expect(hidden.user.since).toBeNull();
    (rnsIdBlockOptions as any).mockReturnValue({ attributes: ["name"], visible: true });
    const shown = await callerFor(OWNER_ID).getHandle({ handle: "jordan-ellis-4821" });
    expect(shown.user.since).toBe("2026-03");
  });
});

describe("handle.getHandle page visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.theme.findUnique.mockResolvedValue({ id: 1, name: "Default", config: null });
    db.block.findMany.mockResolvedValue([]);
  });

  it("returns an unpublished page to its owner", async () => {
    db.user.findFirst.mockResolvedValue(fanAccount("UNPUBLISHED"));
    const result = await callerFor(OWNER_ID).getHandle({ handle: "jordan-ellis-4821" });
    expect(result.user.id).toBe(OWNER_ID);
  });

  it("hides an unpublished page from a signed out visitor", async () => {
    db.user.findFirst.mockResolvedValue(fanAccount("UNPUBLISHED"));
    await expect(callerFor().getHandle({ handle: "jordan-ellis-4821" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("hides an unpublished page from another signed in user", async () => {
    db.user.findFirst.mockResolvedValue(fanAccount("UNPUBLISHED"));
    await expect(
      callerFor(OWNER_ID + 1).getHandle({ handle: "jordan-ellis-4821" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns a published page to anyone", async () => {
    db.user.findFirst.mockResolvedValue(fanAccount("PUBLISHED"));
    const result = await callerFor().getHandle({ handle: "jordan-ellis-4821" });
    expect(result.user.id).toBe(OWNER_ID);
  });

  it("returns not found for an unknown handle", async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(callerFor(OWNER_ID).getHandle({ handle: "nobody-here" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
