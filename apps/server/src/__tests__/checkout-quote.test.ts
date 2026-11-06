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
  storePolicyVersionId?: Buffer | null;
};

const state = vi.hoisted(() => ({
  item: null as unknown,
  offer: null as unknown,
  rows: [] as Row[],
  wallet: { address: "0xabc" } as { address: string } | null,
  countedToday: 0,
  seller: { pass: true } as { pass: boolean; reason?: string },
  merchant: { pass: true, feeBps: 2_000 } as {
    pass: boolean;
    feeBps?: number;
    reason?: string;
  },
  mockPrice: null as string | null,
  appEnv: "staging",
  testnetChain: true,
  ampedPay: false,
  live: null as { id: Buffer; version: number; mode: string; settings: unknown } | null,
  policyWrites: [] as unknown[],
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

const merchantOffer = () => ({
  slug: "standard-check",
  title: "Standard check",
  kind: "service",
  status: "active",
  adult: false,
  amountUnits: 3_000_000n,
  accessPeriodDays: null,
  merchantId: Buffer.from("11".repeat(16), "hex"),
  merchant: { slug: "authbase", name: "Authbase" },
  fulfillment: "external",
  creator: {
    id: 10,
    handle: "maya",
    name: "Maya",
    block: "no",
    page_status: "PUBLISHED",
    image: null,
    image_file_id: null,
    theme: null,
    storeSettings: { status: "live" },
  },
  items: [
    {
      contentItem: {
        status: "READY",
        publishState: "PUBLISHED",
        moderationState: "CLEAR",
        adult: false,
        deletedAt: null,
      },
    },
  ],
});

vi.mock("@repo/database", () => ({
  prisma: {
    contentItem: { findUnique: vi.fn(async () => state.item) },
    offer: { findUnique: vi.fn(async () => state.offer) },
    merchant: {
      findUnique: vi.fn(async () => ({
        name: "Authbase",
        storePolicyUrl: "https://authbase.test/policy",
      })),
    },
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
      updateMany: vi.fn(
        async (args: { where: { id: Buffer }; data: { storePolicyVersionId: Buffer } }) => {
          state.policyWrites.push(args);
          const row = state.rows.find(r => r.id.equals(args.where.id));
          if (row && !row.storePolicyVersionId)
            row.storePolicyVersionId = args.data.storePolicyVersionId;
          return { count: 1 };
        }
      ),
    },
  },
}));

vi.mock("../env", () => ({
  env: {
    get APP_ENV() {
      return state.appEnv;
    },
  },
}));

vi.mock("../services/usdc/chain", () => ({
  paymentChain: {
    get testnet() {
      return state.testnetChain;
    },
  },
}));

vi.mock("../services/store/policy", () => ({
  liveVersion: vi.fn(async () => state.live),
  versionSummary: (row: { version: number; settings: { sellerName: string } }) => ({
    sellerName: row.settings.sellerName,
    summary: "",
    version: row.version,
  }),
}));
vi.mock("../services/payments/ready", () => ({ paymentsReady: () => state.ampedPay }));
vi.mock("../services/payments/settings", () => ({
  paymentSettings: vi.fn(async () => state.settings),
}));

vi.mock("../utils/fileUrlResolver", () => ({
  getFileUrl: vi.fn(
    async ({ legacyImageField }: { legacyImageField: string | null }) => legacyImageField
  ),
}));

const checkIdentity = vi.hoisted(() => vi.fn());
vi.mock("../services/identity/checks", () => ({ checkIdentity }));
const checkMerchant = vi.hoisted(() => vi.fn());
vi.mock("../services/merchants/check", () => ({ checkMerchant }));

import { quoteIntent } from "../services/checkout/quote";
import { checkoutProvider, mockProviderAllowed } from "../services/checkout/provider";
import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";

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
  state.offer = null;
  state.rows = [intent()];
  state.wallet = { address: "0xabc" };
  state.countedToday = 0;
  state.seller = { pass: true };
  state.merchant = { pass: true, feeBps: 2_000 };
  checkIdentity.mockReset();
  checkIdentity.mockImplementation(async () => state.seller);
  checkMerchant.mockReset();
  checkMerchant.mockImplementation(async () => state.merchant);
  // A merchant offer is only for sale while the storefront is on (AB-2); a store needs storeSales
  __setFeatureFlagOverridesForTests({ storeSales: true, authbaseStorefront: true });
  state.mockPrice = null;
  state.appEnv = "staging";
  state.testnetChain = true;
  state.ampedPay = false;
  state.live = null;
  state.policyWrites = [];
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
      path: "/maya/c/abc123",
      accessPeriodDays: null,
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

  it("a creator without a verified seller pass cannot take payments (identity checks 5.3)", async () => {
    for (const reason of [
      "not_verified",
      "no_name",
      "name_expired",
      "name_not_bound",
      "unavailable",
    ]) {
      state.seller = { pass: false, reason };
      expect((await quoteIntent(20, ID)).state).toBe("seller");
    }
    expect(checkIdentity).toHaveBeenCalledWith(10, "seller", { fresh: true });
    state.seller = { pass: true };
    expect((await quoteIntent(20, ID)).state).toBe("ready");
  });

  it("the seller check runs after paused and the wallet, before the daily limit", async () => {
    state.settings = { ...state.settings, paymentsPaused: true };
    state.seller = { pass: false, reason: "no_name" };
    expect((await quoteIntent(20, ID)).state).toBe("paused");
    state.settings = { ...state.settings, paymentsPaused: false };
    state.wallet = null;
    expect((await quoteIntent(20, ID)).state).toBe("seller");
    expect(checkIdentity).not.toHaveBeenCalled();
    state.wallet = { address: "0xabc" };
    state.countedToday = 20;
    expect((await quoteIntent(20, ID)).state).toBe("seller");
    state.seller = { pass: true };
    expect((await quoteIntent(20, ID)).state).toBe("limit");
  });

  it("the daily purchase limit stops a new payment", async () => {
    state.countedToday = 20;
    expect((await quoteIntent(20, ID)).state).toBe("limit");
  });

  it("a merchant offer quotes the merchant fee and still respects the daily limit (AB-1)", async () => {
    state.rows = [intent({ targetType: "offer", targetId: "aa".repeat(16) })];
    state.offer = merchantOffer();
    state.countedToday = 20;
    // The limit is a buyer rule, not a seller rule: it applies to merchant offers too
    expect((await quoteIntent(20, ID)).state).toBe("limit");
    state.countedToday = 0;

    const quote = await quoteIntent(20, ID);
    expect(quote.state).toBe("ready");
    expect(quote.feeBps).toBe(2_000);
    expect(quote.fee).toBe("600000");
    // The creator gate is replaced by checkMerchant, never run next to it
    expect(checkIdentity).not.toHaveBeenCalled();
    expect(checkMerchant).toHaveBeenCalled();

    state.merchant = { pass: false, reason: "not_active" };
    expect((await quoteIntent(20, ID)).state).toBe("seller");
  });
});

describe("quoteIntent: terminal and refused states", () => {
  it("a paid intent quotes paid, never ready, even when the item was removed since", async () => {
    state.rows = [intent({ status: "paid" })];
    expect((await quoteIntent(20, ID)).state).toBe("paid");
    state.settings = { ...state.settings, paymentsPaused: true };
    expect((await quoteIntent(20, ID)).state).toBe("paid");
    state.item = { ...sellable(), deletedAt: new Date() };
    expect((await quoteIntent(20, ID)).state).toBe("paid");
  });

  it("refuses the mock provider in production", async () => {
    state.appEnv = "production";
    await expect(quoteIntent(20, ID)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("refuses the mock provider on a mainnet payment chain", async () => {
    state.testnetChain = false;
    await expect(quoteIntent(20, ID)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("quotes on AmpedPay once it is configured, in production too (CK-5)", async () => {
    state.ampedPay = true;
    state.appEnv = "production";
    state.testnetChain = false;
    expect((await quoteIntent(20, ID)).provider).toBe("ampedpay");
  });
});

describe("quoteIntent: store policy (CK-5)", () => {
  const version = (n: number) => ({
    id: Buffer.alloc(16, n),
    version: n,
    mode: "standard",
    settings: { sellerName: "Maya Lin" },
  });

  it("names the policy seller and stores the version on the intent at the first quote", async () => {
    state.live = version(2);
    const quote = await quoteIntent(20, ID);
    expect(quote.policy).toEqual({ version: 2, sellerName: "Maya Lin", changed: false });
    expect(state.rows[0]!.storePolicyVersionId).toEqual(Buffer.alloc(16, 2));
    // A second quote reads the stored version and writes nothing
    state.policyWrites = [];
    expect((await quoteIntent(20, ID)).policy?.changed).toBe(false);
    expect(state.policyWrites).toHaveLength(0);
  });

  it("reads changed when the creator publishes a new version after the first quote", async () => {
    state.live = version(2);
    await quoteIntent(20, ID);
    state.live = version(3);
    expect((await quoteIntent(20, ID)).policy).toEqual({
      version: 3,
      sellerName: "Maya Lin",
      changed: true,
    });
  });

  it("has no policy before the creator publishes one", async () => {
    expect((await quoteIntent(20, ID)).policy).toBeNull();
  });
});

describe("checkoutProvider (mock safety rail)", () => {
  it("allows the mock only outside production and on a test chain", () => {
    const env = (appEnv: string, testnetChain: boolean, ampedPay = false) => ({
      appEnv,
      testnetChain,
      ampedPay,
    });
    expect(mockProviderAllowed(env("staging", true))).toBe(true);
    expect(mockProviderAllowed(env("development", true))).toBe(true);
    expect(mockProviderAllowed(env("production", true))).toBe(false);
    expect(mockProviderAllowed(env("staging", false))).toBe(false);
    expect(checkoutProvider(env("staging", true))).toBe("mock");
    expect(checkoutProvider(env("production", false, true))).toBe("ampedpay");
    expect(() => checkoutProvider(env("production", false))).toThrow(
      "Checkout is not available yet."
    );
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
