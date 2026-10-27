/**
 * Screen Review 110 I03, I04, I08: the recipient trust read behind Send. The
 * chain, Authbase, database and cache are mocked, so no network is needed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const WALLET = "0x7a3F00000000000000000000000000000000c91E";
const OTHER = "0x1111111111111111111111111111111111111111";
const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);

const state = vi.hoisted(() => ({
  record: { expiry: 0, owner: null as string | null, addr: null as string | null },
  verified: true as boolean | "throw",
  configured: true,
  user: null as null | { handle: string; name: string; image: string | null; image_file_id: null },
  primary: null as string | null,
}));

vi.mock("../services/rns", () => ({
  readRnsNameOnChain: vi.fn(async () => state.record),
}));
vi.mock("../services/rnsSummary", () => ({
  readPrimaryName: vi.fn(async () => state.primary),
}));
vi.mock("../services/authbase", () => ({
  isAuthbaseConfigured: () => state.configured,
  getAuthbaseWalletStatus: vi.fn(async () => {
    if (state.verified === "throw") throw new Error("down");
    // Attributes come back from Authbase; the trust read must drop them
    return { verified: state.verified, attributes: { name: "Secret Name" } };
  }),
}));
vi.mock("@repo/database", () => ({
  prisma: { user: { findFirst: vi.fn(async () => state.user) } },
}));
vi.mock("../utils/cache", () => ({
  cache: { get: vi.fn(async () => null), set: vi.fn(async () => undefined) },
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));

import { getRecipientTrust } from "../services/rnsTrust";

beforeEach(() => {
  state.record = { expiry: now() + 300 * DAY, owner: WALLET, addr: WALLET };
  state.verified = true;
  state.configured = true;
  state.user = { handle: "maya.lin", name: "Maya Lin", image: null, image_file_id: null };
  state.primary = null;
});

describe("getRecipientTrust", () => {
  it("bare label and full name resolve to the same verified owner", async () => {
    const bare = await getRecipientTrust("mayalin");
    const full = await getRecipientTrust("mayalin.revotest.eth");
    expect(bare).toEqual(full);
    expect(bare.status).toBe("ok");
    if (bare.status !== "ok") return;
    expect(bare.verifiedOwner).toBe(true);
    expect(bare.resolvedAddress).toBe(WALLET);
    expect(bare.profile).toEqual({ handle: "maya.lin", displayName: "Maya Lin", avatar: null });
  });

  it("a verified owner whose name points elsewhere is not a verified owner", async () => {
    state.record = { expiry: now() + 300 * DAY, owner: WALLET, addr: OTHER };
    const trust = await getRecipientTrust("mayalin");
    expect(trust.status).toBe("ok");
    if (trust.status !== "ok") return;
    expect(trust.pointsToOwner).toBe(false);
    expect(trust.verifiedOwner).toBe(false);
  });

  it("an expired name cannot receive (expiry, not the grace end)", async () => {
    state.record = { expiry: now() - 60, owner: null, addr: WALLET };
    const trust = await getRecipientTrust("mayalin");
    expect(trust.status).toBe("expired");
  });

  it("an unregistered name is not found, a bad label is invalid", async () => {
    state.record = { expiry: 0, owner: null, addr: null };
    expect((await getRecipientTrust("nobody-here")).status).toBe("not_found");
    expect((await getRecipientTrust("a!")).status).toBe("invalid");
  });

  it("a name without an addr record does not point to a wallet", async () => {
    state.record = { expiry: now() + DAY * 40, owner: WALLET, addr: null };
    expect((await getRecipientTrust("mayalin")).status).toBe("no_address");
  });

  it("Authbase down reads unavailable, never verified", async () => {
    state.verified = "throw";
    const trust = await getRecipientTrust("mayalin");
    if (trust.status !== "ok") throw new Error("expected ok");
    expect(trust.verification).toBe("unavailable");
    expect(trust.verifiedOwner).toBe(false);
  });

  it("a plain address uses the same rule and shows its primary name", async () => {
    state.primary = "mayalin.revotest.eth";
    const trust = await getRecipientTrust(WALLET.toLowerCase());
    if (trust.status !== "ok") throw new Error("expected ok");
    expect(trust.label).toBeNull();
    expect(trust.primaryName).toBe("mayalin.revotest.eth");
    expect(trust.verifiedOwner).toBe(true);
  });

  it("the zero address is invalid", async () => {
    expect((await getRecipientTrust("0x0000000000000000000000000000000000000000")).status).toBe(
      "invalid"
    );
  });

  it("never returns Authbase attributes", async () => {
    const trust = await getRecipientTrust("mayalin");
    expect(JSON.stringify(trust)).not.toContain("Secret Name");
    expect(JSON.stringify(trust)).not.toContain("attributes");
  });
});
