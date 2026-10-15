/**
 * USDC-3 Admin, Money (Build Board #29), spec docs/features/usdc-wallet-onramp.md
 * 3.8: gas ledger math, runway, top up recording, the pause switch, the
 * overview, and admin only access. The database, the Base RPC, the relayer
 * and the price feed are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAddress, parseEther, type Hex } from "viem";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    siteSettings: { findUnique: fn(), upsert: fn() },
    user: { findMany: fn() },
    usdcSend: { aggregate: fn(), count: fn(), findMany: fn() },
    screeningEvent: { findMany: fn() },
    relayerFundingEvent: { findFirst: fn(), findMany: fn(), create: fn() },
  };
});

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));

import { env } from "../env";
import { setPaymentClientForTests } from "../services/usdc/chain";
import { setRelayerForTests, gasState, type Relayer } from "../services/usdc/relayer";
import {
  clearEthPriceCacheForTests,
  gasShareOfVolume,
  moneyOverview,
  recordFunding,
  runwayDays,
  setSendsPaused,
  startOfUtcMonth,
} from "../services/usdc/admin";
import { moneyAdminRouter } from "../trpc/admin/money";

const RELAYER = getAddress("0x9999999999999999999999999999999999999999");
const TREASURY = getAddress("0x7777777777777777777777777777777777777777");
const SAFE = getAddress("0x5555555555555555555555555555555555555555");
const HASH = `0x${"ab".repeat(32)}` as Hex;
const NOW = new Date("2026-10-12T15:00:00Z");

const chain = {
  getTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
  getBalance: vi.fn(),
};

const relayer = {
  address: vi.fn(async () => RELAYER),
  gas: vi.fn(async () => gasState(parseEther("0.2"))),
  submit: vi.fn(),
} satisfies Relayer;

beforeEach(() => {
  vi.clearAllMocks();
  clearEthPriceCacheForTests();
  setPaymentClientForTests(chain as never);
  setRelayerForTests(relayer);
  Object.assign(env, {
    USDC_ENABLED: true,
    CDP_API_KEY_ID: "kid",
    CDP_API_KEY_SECRET: "secret",
    CDP_WALLET_SECRET: "wallet",
    CDP_RELAYER_ACCOUNT: "amped-relayer-staging",
    CIRCLE_API_KEY: "",
    CHAINALYSIS_ORACLE: "",
    USDC_SCREEN_DENYLIST: "0x1111111111111111111111111111111111111111",
    USDC_SCREENING_REQUIRED: false,
  });
  db.relayerFundingEvent.findFirst.mockResolvedValue(null);
  db.relayerFundingEvent.create.mockResolvedValue({});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: { amount: "3000.00" } })))
  );
});

describe("gas ledger math", () => {
  it("reads the month from the first day at 00:00 UTC", () => {
    expect(startOfUtcMonth(NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("gives runway in whole days at the last 7 days' spend, and none without spend", () => {
    expect(runwayDays(parseEther("0.2"), parseEther("0.07"))).toBe(20);
    expect(runwayDays(parseEther("0.2"), 0n)).toBeNull();
  });

  it("shows gas as a share of USDC moved, only with a price and volume", () => {
    // 0.001 ETH at 3,000 USD is 3 USD against 1,000 USDC: 0.3%
    expect(gasShareOfVolume(parseEther("0.001"), 3000, 1_000_000_000n)).toBe(0.3);
    expect(gasShareOfVolume(parseEther("0.001"), null, 1_000_000_000n)).toBeNull();
    expect(gasShareOfVolume(parseEther("0.001"), 3000, 0n)).toBeNull();
  });
});

describe("Pause USDC sends", () => {
  it("stores the switch in site settings, which the send path reads on every request", async () => {
    await setSendsPaused(true);
    expect(db.siteSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { setting_key: "usdc_sends_paused" },
        update: { setting_value: "true", value_type: "BOOLEAN" },
      })
    );
  });
});

describe("overview", () => {
  it("reports the relayer, runway, ledger, today's sends and screening setup", async () => {
    db.siteSettings.findUnique.mockResolvedValue({ setting_value: "true" });
    db.usdcSend.aggregate.mockImplementation(async (args: { _sum: { gasCostWei?: true } }) =>
      args._sum.gasCostWei
        ? { _sum: { gasCostWei: parseEther("0.0007") }, _count: { _all: 7 } }
        : { _sum: { amount: 70_000_000n }, _count: { _all: 3 } }
    );
    db.usdcSend.count.mockResolvedValue(2);
    const overview = await moneyOverview(NOW);
    expect(overview).toMatchObject({
      network: "Base Sepolia",
      enabled: true,
      paused: true,
      relayer: {
        configured: true,
        reachable: true,
        address: RELAYER,
        alarm: false,
        stopped: false,
      },
      runwayDays: 2000,
      gas: { monthSends: 7, perSendWei: (parseEther("0.0007") / 7n).toString(), ethUsd: 3000 },
      sendsToday: { count: 3, refused: 2 },
      screening: { circle: false, oracle: false, denylist: 1, required: false },
    });
  });

  it("says the relayer is not set up instead of failing", async () => {
    env.CDP_RELAYER_ACCOUNT = "";
    setRelayerForTests(null);
    db.siteSettings.findUnique.mockResolvedValue(null);
    db.usdcSend.aggregate.mockResolvedValue({ _sum: {}, _count: { _all: 0 } });
    db.usdcSend.count.mockResolvedValue(0);
    const overview = await moneyOverview(NOW);
    expect(overview.relayer).toEqual({ configured: false });
    expect(overview.runwayDays).toBeNull();
  });
});

describe("record a relayer top up", () => {
  const record = (extra: { amountEth?: string } = {}) =>
    recordFunding({ txHash: HASH, adminUserId: 1, ...extra });

  it("verifies a direct transfer from the transaction itself", async () => {
    chain.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 100n });
    chain.getTransaction.mockResolvedValue({
      to: RELAYER,
      from: TREASURY,
      value: parseEther("0.5"),
    });
    expect(await record()).toEqual({ amountWei: parseEther("0.5").toString(), verified: true });
    expect(db.relayerFundingEvent.create.mock.calls[0][0].data).toMatchObject({
      txHash: HASH,
      fromAddress: TREASURY,
      toAddress: RELAYER,
      amountWei: parseEther("0.5"),
      verified: true,
      recordedBy: 1,
    });
  });

  it("reads a multisig transfer from the relayer's balance change in that block", async () => {
    chain.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 100n });
    chain.getTransaction.mockResolvedValue({ to: SAFE, from: TREASURY, value: 0n });
    chain.getBalance.mockImplementation(async ({ blockNumber }: { blockNumber: bigint }) =>
      blockNumber === 100n ? parseEther("0.7") : parseEther("0.2")
    );
    expect(await record()).toEqual({ amountWei: parseEther("0.5").toString(), verified: true });
  });

  it("stores the admin's amount as not verified when the RPC keeps no past state", async () => {
    chain.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 100n });
    chain.getTransaction.mockResolvedValue({ to: SAFE, from: TREASURY, value: 0n });
    chain.getBalance.mockRejectedValue(new Error("missing trie node"));
    await expect(record()).rejects.toThrow(/Enter the ETH amount/);
    expect(await record({ amountEth: "0.25" })).toEqual({
      amountWei: parseEther("0.25").toString(),
      verified: false,
    });
  });

  it("refuses a failed transaction, a duplicate and a bad hash", async () => {
    chain.getTransactionReceipt.mockResolvedValue({ status: "reverted", blockNumber: 100n });
    chain.getTransaction.mockResolvedValue({ to: RELAYER, from: TREASURY, value: 1n });
    await expect(record()).rejects.toThrow(/failed on chain/);
    db.relayerFundingEvent.findFirst.mockResolvedValue({ id: new Uint8Array(16) });
    await expect(record()).rejects.toThrow(/already recorded/);
    await expect(recordFunding({ txHash: "0x123", adminUserId: 1 })).rejects.toThrow(
      /transaction hash/
    );
  });

  it("refuses a top up larger than the BIGINT gas ledger can store", async () => {
    chain.getTransactionReceipt.mockResolvedValue({ status: "success", blockNumber: 100n });
    chain.getTransaction.mockResolvedValue({ to: RELAYER, from: TREASURY, value: parseEther("10") });
    await expect(record()).rejects.toThrow(/exceeds the largest amount/);
    expect(db.relayerFundingEvent.create).not.toHaveBeenCalled();
  });
});

describe("admin only", () => {
  it("refuses a signed in member who is not an admin", async () => {
    const member = moneyAdminRouter.createCaller({ user: { sub: 7, role: "user" } } as never);
    await expect(member.setPaused({ paused: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.siteSettings.upsert).not.toHaveBeenCalled();
  });

  it("lets an admin pause sends", async () => {
    const admin = moneyAdminRouter.createCaller({ user: { sub: 1, role: "admin" } } as never);
    await expect(admin.setPaused({ paused: true })).resolves.toEqual({ paused: true });
  });
});
