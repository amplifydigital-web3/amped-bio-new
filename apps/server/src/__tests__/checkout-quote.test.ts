/**
 * The pay sheet quote (Build Board #49 Mobile checkout, PR CK-2). The database and the
 * payments settings are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: Buffer;
  targetType: string;
  targetId: string;
  creatorUserId: number;
  userId: number | null;
  status: string;
  expiresAt: Date;
};

const state = vi.hoisted(() => ({
  item: null as unknown,
  rows: [] as Row[],
  wallet: { address: "0xabc" } as { address: string } | null,
  countedToday: 0,
  mockPrice: null as string | null,
  settings: {
    paymentsPaused: false,
    platformFeeBps: 500,
    oneTimePriceMin: 500_000n,
    oneTimePriceMax: 1_000_000_000n,
    quoteWindowSeconds: 600,
    purchasesPerDayPerAccount: 20,
    pilotOnly: false,
    pilotCreators: [] as string[],
  },
}));

const sellable = () => ({
  title: "Episode 4",
  publicId: "abc123",
  kind: "VIDEO",
  status: "READY",
  publishState: "PUBLISHED",
  moderationState: "CLEAR",
  adult: false,
  deletedAt: null,
  user: {
    id: 10,
    handle: "maya",
    name: "Maya",
    block: "no",
    page_status: "PUBLISHED",
    image: "https://example.com/maya.png",
    image_file_id: null,
    theme: null,
  },
});

vi.mock("@repo/database", () => ({
  prisma: {
    contentItem: { findUnique: vi.fn(async () => state.item) },
    theme: { findUnique: vi.fn(async () => null) },
    siteSettings: {
      findUnique: vi.fn(async () =>
        state.mockPrice === null ? null : { setting_value: state.mockPrice }
      ),
    },
    userWallet: { findUnique: vi.fn(async () => state.wallet) },
    checkoutIntent: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: Buffer } }) =>
          state.rows.find(r => r.id.equals(where.id)) ?? null
      ),
      count: vi.fn(async () => state.countedToday),
      update: vi.fn(async () => undefined),
    },
  },
}));

vi.mock("../services/payments/settings", () => ({
  paymentSettings: vi.fn(async () => state.settings),
}));

vi.mock("../utils/fileUrlResolver", () => ({
  getFileUrl: vi.fn(
    async ({ legacyImageField }: { legacyImageField: string | null }) => legacyImageField
  ),
}));

import { quoteIntent } from "../services/checkout/quote";

const ID = "0f".repeat(16);

function intent(overrides: Partial<Row> = {}): Row {
  return {
    id: Buffer.from(ID, "hex"),
    targetType: "content",
    targetId: "abc123",
    creatorUserId: 10,
    userId: 20,
    status: "open",
    expiresAt: new Date(Date.now() + 3600_000),
    ...overrides,
  };
}

beforeEach(() => {
  state.item = sellable();
  state.rows = [intent()];
  state.wallet = { address: "0xabc" };
  state.countedToday = 0;
  state.mockPrice = null;
  state.settings = {
    ...state.settings,
    paymentsPaused: false,
    pilotOnly: false,
    pilotCreators: [],
    purchasesPerDayPerAccount: 20,
  };
});

describe("quoteIntent", () => {
  it("quotes the mock price with the fee included and the quote window", async () => {
    const quote = await quoteIntent(20, ID);
    expect(quote.state).toBe("ready");
    expect(quote.provider).toBe("mock");
    expect(quote.amount).toBe("3000000");
    expect(quote.fee).toBe("150000");
    expect(quote.feeBps).toBe(500);
    expect(new Date(quote.validUntil).getTime() - new Date(quote.quotedAt).getTime()).toBe(600_000);
    expect(quote.item).toEqual({
      title: "Episode 4",
      publicId: "abc123",
      kind: "VIDEO",
      adult: false,
    });
    expect(quote.creator?.handle).toBe("maya");
    expect(quote.creator?.image).toBe("https://example.com/maya.png");
  });

  it("the checkout_mock_price_units site setting sets the mock price within the bounds", async () => {
    state.mockPrice = "1500000";
    expect((await quoteIntent(20, ID)).amount).toBe("1500000");
    state.mockPrice = "100";
    expect((await quoteIntent(20, ID)).amount).toBe("500000");
    state.mockPrice = "2 USDC";
    expect((await quoteIntent(20, ID)).amount).toBe("3000000");
  });

  it("only the fan who claimed the intent can read it", async () => {
    await expect(quoteIntent(30, ID)).rejects.toThrow("checkout has ended");
    state.rows = [intent({ userId: null })];
    await expect(quoteIntent(20, ID)).rejects.toThrow("checkout has ended");
  });

  it("an expired intent is not found; a removed item reads removed", async () => {
    state.rows = [intent({ expiresAt: new Date(Date.now() - 1000) })];
    await expect(quoteIntent(20, ID)).rejects.toThrow("checkout has ended");
    state.rows = [intent()];
    state.item = { ...sellable(), deletedAt: new Date() };
    const quote = await quoteIntent(20, ID);
    expect(quote.state).toBe("removed");
    expect(quote.item).toBeNull();
    expect(quote.creator).toBeNull();
  });

  it("payments paused wins over every other state", async () => {
    state.settings = { ...state.settings, paymentsPaused: true };
    state.wallet = null;
    expect((await quoteIntent(20, ID)).state).toBe("paused");
  });

  it("a creator with no wallet or outside the pilot cannot take payments", async () => {
    state.wallet = null;
    expect((await quoteIntent(20, ID)).state).toBe("seller");
    state.wallet = { address: "0xabc" };
    state.settings = { ...state.settings, pilotOnly: true, pilotCreators: ["ana"] };
    expect((await quoteIntent(20, ID)).state).toBe("seller");
    state.settings = { ...state.settings, pilotCreators: ["ana", "maya"] };
    expect((await quoteIntent(20, ID)).state).toBe("ready");
  });

  it("the daily purchase limit stops a new payment", async () => {
    state.countedToday = 20;
    expect((await quoteIntent(20, ID)).state).toBe("limit");
  });
});

describe("usdcDollars (decision D6)", () => {
  it("drops whole cents, keeps two places otherwise and rounds a remainder up", async () => {
    const { usdcDollars, usdcDollarsLabel } = await import("@repo/constants");
    expect(usdcDollars(3_000_000n)).toBe("$3");
    expect(usdcDollars("12500000")).toBe("$12.50");
    expect(usdcDollars(1_234_567_890n)).toBe("$1,234.57");
    expect(usdcDollars(1n)).toBe("$0.01");
    expect(usdcDollars(2_999_999n)).toBe("$3");
    expect(usdcDollarsLabel(5_000_000n)).toBe("$5 USDC");
  });
});
