/**
 * 18+ before the gating engine (identity checks 4.4, PR A1): who may see 18+, the
 * Adult items signal, and opening an ungated 18+ item through loadItemForViewer
 * (getReadUrl while accessGating is off).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  item: null as Record<string, unknown> | null,
  prisma: {
    contentItem: { findUnique: vi.fn(), findFirst: vi.fn() },
    contentAsset: { findMany: vi.fn(async () => []) },
  },
}));
const identity = vi.hoisted(() => ({ checkIdentity: vi.fn() }));

vi.mock("@repo/database", () => ({ prisma: db.prisma }));
vi.mock("../services/identity/checks", () => identity);
vi.mock("../utils/rateLimit", () => ({ hitRateLimit: vi.fn(async () => 1) }));

import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import {
  adultRefusal,
  canViewAdult,
  hasAdultItems,
  viewerAdultRefusal,
} from "../services/content/adult";
import { loadItemForViewer } from "../services/content/viewer";

const PASS = { pass: true, validUntil: new Date(Date.now() + 86_400_000), tier: "STANDARD" };

const adultItem = (over: Record<string, unknown> = {}) => ({
  id: new Uint8Array(16),
  publicId: "abcdefghijklmnop",
  userId: 7,
  status: "READY",
  publishState: "PUBLISHED",
  moderationState: "CLEAR",
  accessRuleId: null,
  adult: true,
  deletedAt: null,
  user: { page_status: "PUBLISHED", block: "no", handle: "maya", name: "Maya" },
  ...over,
});

beforeEach(() => {
  __setFeatureFlagOverridesForTests({});
  identity.checkIdentity.mockReset();
  identity.checkIdentity.mockResolvedValue({ pass: false, reason: "not_linked" });
  db.prisma.contentItem.findUnique.mockReset();
  db.prisma.contentItem.findFirst.mockReset();
});

describe("adultRefusal", () => {
  it("maps each check result to one sheet state", () => {
    expect(adultRefusal("signed_out")).toBe("signed_out");
    expect(adultRefusal(PASS as never)).toBeNull();
    for (const reason of ["no_wallet", "not_linked", "not_verified", "not_shared", "under_18"]) {
      expect(adultRefusal({ pass: false, reason } as never)).toBe(reason);
    }
    expect(adultRefusal({ pass: false, reason: "unavailable" })).toBe("unavailable");
    // A seller reason never opens anything
    expect(adultRefusal({ pass: false, reason: "no_name" })).toBe("unavailable");
  });
});

describe("viewerAdultRefusal and canViewAdult", () => {
  it("is closed while the flag is off, without asking Authbase", async () => {
    identity.checkIdentity.mockResolvedValue(PASS);
    expect(await viewerAdultRefusal(20)).toBe("closed");
    expect(await canViewAdult(20)).toBe(false);
    expect(identity.checkIdentity).not.toHaveBeenCalled();
  });

  it("opens only on an Over 18 pass once the flag is on", async () => {
    __setFeatureFlagOverridesForTests({ adultContent: true });
    expect(await viewerAdultRefusal(null)).toBe("signed_out");
    expect(await canViewAdult(20)).toBe(false);
    identity.checkIdentity.mockResolvedValue(PASS);
    expect(await canViewAdult(20)).toBe(true);
    expect(identity.checkIdentity).toHaveBeenLastCalledWith(20, "age_over_18");
  });
});

describe("hasAdultItems", () => {
  it("is false while the flag is off and reads one listed 18+ row when on", async () => {
    db.prisma.contentItem.findFirst.mockResolvedValue({ id: new Uint8Array(16) });
    expect(await hasAdultItems(7)).toBe(false);
    expect(db.prisma.contentItem.findFirst).not.toHaveBeenCalled();
    __setFeatureFlagOverridesForTests({ adultContent: true });
    expect(await hasAdultItems(7)).toBe(true);
    const where = db.prisma.contentItem.findFirst.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      userId: 7,
      adult: true,
      status: "READY",
      publishState: "PUBLISHED",
      moderationState: "CLEAR",
    });
  });
});

describe("loadItemForViewer with an 18+ item", () => {
  it("refuses everyone but the owner while the flag is off", async () => {
    db.prisma.contentItem.findUnique.mockResolvedValue(adultItem());
    identity.checkIdentity.mockResolvedValue(PASS);
    await expect(loadItemForViewer("abcdefghijklmnop", 20)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await loadItemForViewer("abcdefghijklmnop", 7)).decision).toBe("owner");
  });

  it("opens to a fan with a pass on the private lifetimes, and never a gated or held one", async () => {
    __setFeatureFlagOverridesForTests({ adultContent: true });
    db.prisma.contentItem.findUnique.mockResolvedValue(adultItem());
    await expect(loadItemForViewer("abcdefghijklmnop", 20)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(loadItemForViewer("abcdefghijklmnop", null)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    identity.checkIdentity.mockResolvedValue(PASS);
    const loaded = await loadItemForViewer("abcdefghijklmnop", 20);
    expect(loaded).toMatchObject({ decision: "public", access: "private" });

    db.prisma.contentItem.findUnique.mockResolvedValue(
      adultItem({ accessRuleId: new Uint8Array(16) })
    );
    await expect(loadItemForViewer("abcdefghijklmnop", 20)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    db.prisma.contentItem.findUnique.mockResolvedValue(adultItem({ moderationState: "HELD" }));
    await expect(loadItemForViewer("abcdefghijklmnop", 20)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
