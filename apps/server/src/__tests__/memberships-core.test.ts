/**
 * Memberships core (MB-1). The rules that matter: a new amount is a new plan version and never
 * touches members; a join is signed by the split signer and by the fan (table and permit) and
 * sent once; the permit covers every membership the fan has; cancel stops charges and keeps
 * access to the period end; renewals check readiness 3 days before, go past due on a revert,
 * keep access 7 days with reminders on day 1, 3 and 6, then end; a lapsed seller pauses
 * renewals; nothing is charged twice. The database and the chain are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { decodeFunctionData, getAddress, type Address } from "viem";
import {
  AMPEDMEMBERSHIPS_ABI,
  JOIN_TABLE_TYPES,
  MEMBERSHIP_CANCEL_TYPES,
  USDC_PERMIT_TYPES,
  membershipRef,
} from "@repo/web3";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    user: { findFirst: fn(), findUnique: fn() },
    userWallet: { findUnique: fn() },
    membershipPlan: { findUnique: fn(), create: fn(), update: fn() },
    membership: {
      findFirst: fn(),
      findUnique: fn(),
      findMany: fn(),
      create: fn(),
      update: fn(),
      updateMany: fn(),
      count: fn(),
    },
    storeSettings: { findUnique: fn() },
    notification: { findFirst: fn(), create: fn(), update: fn() },
    paymentEvent: { create: fn() },
  };
});
const chain = vi.hoisted(() => ({
  balance: 100_000_000n,
  allowance: 100_000_000n,
  nonce: 4n,
  paused: false,
  sub: { nextDue: 0n, charges: 1, active: true } as {
    nextDue: bigint;
    charges: number;
    active: boolean;
  },
  relayer: vi.fn(),
  receipt: null as unknown,
  seller: true,
}));
const { CONTRACT, TREASURY, USDC } = vi.hoisted(() => ({
  CONTRACT: "0x00000000000000000000000000000000000a3d9b" as `0x${string}`,
  TREASURY: "0x000000000000000000000000000000000000beef" as `0x${string}`,
  USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
}));

vi.mock("@repo/database", () => ({ prisma: db }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../services/usdc/chain", () => ({
  paymentChain: { id: 84532 },
  usdcAddress: () => USDC,
  getUsdcBalance: vi.fn(async () => chain.balance),
  usdcDomain: vi.fn(async () => ({ name: "USDC", version: "2", verifyingContract: USDC })),
  paymentClient: () => ({
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === "treasury") return TREASURY;
      if (functionName === "paused") return chain.paused;
      if (functionName === "nonces") return chain.nonce;
      if (functionName === "allowance") return chain.allowance;
      if (functionName === "balanceOf") return chain.balance;
      if (functionName === "getSubscription") return chain.sub;
      throw new Error(functionName);
    }),
    waitForTransactionReceipt: vi.fn(async () => chain.receipt),
    getTransactionReceipt: vi.fn(async () => chain.receipt),
    getBlock: vi.fn(async () => ({ timestamp: 1_793_800_000n })),
  }),
}));
vi.mock("../services/usdc/relayer", () => ({
  RelayerError: class RelayerError extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
  getRelayer: () => ({ call: chain.relayer }),
}));
vi.mock("../services/usdc/screen", () => ({
  ScreeningUnavailableError: class extends Error {},
  screenAddress: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("../services/identity/checks", () => ({
  checkIdentity: vi.fn(async () => ({
    pass: chain.seller,
    reason: chain.seller ? null : "lapsed",
  })),
}));
vi.mock("../services/payments/onchain", () => ({ ampedMembershipsAddress: () => CONTRACT }));
vi.mock("../services/payments/ready", () => ({ paymentsReady: () => true }));
vi.mock("../services/payments/settings", () => ({
  paymentSettings: vi.fn(async () => ({ platformFeeBps: 500, paymentsPaused: false })),
}));
vi.mock("../services/payments/accounts", () => ({
  accountAddress: vi.fn(),
  paymentsCdp: vi.fn(),
}));
vi.mock("../services/store/policy", () => ({
  liveVersion: vi.fn(async () => ({
    id: Buffer.alloc(16, 9),
    version: 3,
    mode: "standard",
    settings: {},
  })),
  versionSummary: () => ({ sellerName: "Maya Lin", summary: "", version: 3 }),
  versionCoversMemberships: (row: { settings: { memberships?: boolean } }) =>
    row.settings.memberships === true,
}));
// C12: the promoter the join's code attributes, if any
const promo = vi.hoisted(() => ({ value: null as Record<string, any> | null, calls: [] as any[] }));
vi.mock("../services/store/promoters", () => ({
  resolvePromoter: vi.fn(async (input: unknown) => {
    promo.calls.push(input);
    return promo.value;
  }),
}));
vi.mock("../services/notifications/push", () => ({ sendPush: vi.fn(async () => ({ sent: 1 })) }));
vi.mock("../utils/email/transport", () => ({
  deliverEmail: vi.fn(async () => ({ transport: "test" })),
}));
vi.mock("../env", () => ({
  env: {
    APP_URL: "https://app.amped.bio",
    LANDINGPAGE_URL: "https://amped.bio",
    AMPEDMEMBERSHIPS_ADDRESS: CONTRACT,
  },
}));

import {
  setJoinSignerForTests,
  prepareJoin,
  submitJoin,
  prepareCancel,
  submitCancel,
  allowanceFor,
  joinRecipients,
  periodFee,
} from "../services/memberships/core";
import {
  upsertPlan,
  setPlanStatus,
  isMember,
  accessUntil,
  publicPlan,
} from "../services/memberships/plans";
import {
  chargeOnce,
  closeCanceledOnce,
  graceOnce,
  readinessOnce,
  sellerPassOnce,
  addUsdcPath,
} from "../services/memberships/renewals";
import { sendPush } from "../services/notifications/push";
import { deliverEmail } from "../utils/email/transport";

const MAYA = 3;
const FAN = 7;
const fanKey = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
);
const otherKey = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
);
const splitKey = privateKeyToAccount(
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
);
const CREATOR_WALLET = "0x00000000000000000000000000000000000c4ea7" as Address;
const NOW = new Date("2026-11-04T18:00:00Z");
const DAY = 86_400_000;

const plan = {
  id: Buffer.alloc(16, 5),
  creatorUserId: MAYA,
  name: "Tide Circle",
  description: null,
  benefits: ["Early demos"],
  amountEvery30Days: 5_000_000n,
  amountYearly: 48_000_000n,
  status: "active",
  version: 2,
  showMemberCount: true,
};

let created: Record<string, unknown> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(chain, {
    balance: 100_000_000n,
    allowance: 100_000_000n,
    paused: false,
    seller: true,
    sub: { nextDue: 0n, charges: 1, active: true },
    receipt: null,
  });
  chain.relayer.mockResolvedValue("0xfeed");
  created = null;
  setJoinSignerForTests({
    address: async () => splitKey.address,
    sign: async (table, chainId, contract) =>
      splitKey.signTypedData({
        domain: { name: "AmpedMemberships", version: "1", chainId, verifyingContract: contract },
        types: JOIN_TABLE_TYPES,
        primaryType: "JoinTable",
        message: table,
      }),
  });
  db.user.findFirst.mockResolvedValue({ id: MAYA, handle: "maya", membershipPlan: plan });
  db.user.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) =>
    where.id === FAN
      ? { wallet: { address: fanKey.address }, email: "fan@example.com" }
      : { handle: "maya", email: null }
  );
  db.userWallet.findUnique.mockResolvedValue({ address: CREATOR_WALLET });
  db.membership.findFirst.mockResolvedValue(null);
  db.membership.findMany.mockResolvedValue([]);
  db.membership.updateMany.mockResolvedValue({ count: 1 });
  db.membership.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    created = { ...data, updatedAt: NOW, createdAt: NOW };
    return created;
  });
  db.membership.findUnique.mockImplementation(async () => created);
  db.notification.findFirst.mockResolvedValue(null);
});

describe("plans", () => {
  it("keeps every 30 days between $1 and $500 and yearly between $10 and $5,000", async () => {
    db.membershipPlan.findUnique.mockResolvedValue(null);
    await expect(
      upsertPlan(MAYA, {
        name: "x",
        benefits: [],
        amountEvery30Days: "500000",
        showMemberCount: true,
      })
    ).rejects.toMatchObject({ code: "amount_every_30_days" });
    await expect(
      upsertPlan(MAYA, {
        name: "x",
        benefits: [],
        amountEvery30Days: "5000000",
        amountYearly: "9000000",
        showMemberCount: true,
      })
    ).rejects.toMatchObject({ code: "amount_yearly" });
  });

  it("makes a new version only when an amount changes", async () => {
    db.membershipPlan.findUnique.mockResolvedValue(plan);
    db.membershipPlan.update.mockResolvedValue(plan);
    db.membership.count.mockResolvedValue(0);
    await upsertPlan(MAYA, {
      name: "New name",
      benefits: [],
      amountEvery30Days: "5000000",
      amountYearly: "48000000",
      showMemberCount: true,
    });
    expect(db.membershipPlan.update.mock.calls[0][0].data.version).toBeUndefined();
    await upsertPlan(MAYA, {
      name: "New name",
      benefits: [],
      amountEvery30Days: "6000000",
      amountYearly: "48000000",
      showMemberCount: true,
    });
    expect(db.membershipPlan.update.mock.calls[1][0].data.version).toEqual({ increment: 1 });
  });

  it("activates only with a policy that covers memberships and a passing seller", async () => {
    const { liveVersion } = await import("../services/store/policy");
    db.membershipPlan.findUnique.mockResolvedValue({ ...plan, status: "draft" });
    vi.mocked(liveVersion).mockResolvedValueOnce(null);
    await expect(setPlanStatus(MAYA, "active")).rejects.toMatchObject({ code: "policy" });
    // A policy published before the plan has no section 5, Memberships: publish again
    vi.mocked(liveVersion).mockResolvedValueOnce({ settings: { memberships: false } } as never);
    await expect(setPlanStatus(MAYA, "active")).rejects.toMatchObject({ code: "policy" });
    vi.mocked(liveVersion).mockResolvedValueOnce({ settings: { memberships: true } } as never);
    chain.seller = false;
    await expect(setPlanStatus(MAYA, "active")).rejects.toMatchObject({ code: "seller" });
  });

  it("names the policy's seller and version on the public plan, and hides a paused plan", async () => {
    const shown = await publicPlan("@Maya", null, NOW);
    expect(shown).toMatchObject({
      handle: "maya",
      sellerName: "Maya Lin",
      policyVersion: 3,
      amountEvery30Days: "5000000",
      yearlySavingPercent: 20,
      viewer: null,
    });
    db.user.findFirst.mockResolvedValueOnce({
      id: MAYA,
      handle: "maya",
      membershipPlan: { ...plan, status: "paused" },
    });
    expect(await publicPlan("maya", null, NOW)).toBeNull();
  });
});

async function signJoin(result: Awaited<ReturnType<typeof prepareJoin>>, key = fanKey) {
  if (result.refused) throw new Error(result.reason);
  const j = result.typed.join;
  const p = result.typed.permit;
  const memberSignature = await key.signTypedData({
    domain: j.domain,
    types: JOIN_TABLE_TYPES,
    primaryType: "JoinTable",
    message: {
      ...j.message,
      price: BigInt(j.message.price),
      validBefore: BigInt(j.message.validBefore),
    },
  });
  const permitSignature = await key.signTypedData({
    domain: p.domain,
    types: USDC_PERMIT_TYPES,
    primaryType: "Permit",
    message: {
      owner: p.message.owner,
      spender: p.message.spender,
      value: BigInt(p.message.value),
      nonce: BigInt(p.message.nonce),
      deadline: BigInt(p.message.deadline),
    },
  });
  return { membershipId: result.membershipId, memberSignature, permitSignature };
}

describe("join", () => {
  it("builds a table with creator and platform rows, signed by the split signer", async () => {
    const result = await prepareJoin(FAN, { handle: "maya", interval: "every_30_days" }, NOW);
    expect(result.refused).toBe(false);
    if (result.refused) return;
    expect(result.amount).toBe("5000000");
    expect(result.fee).toBe("250000");
    expect(result.sellerName).toBe("Maya Lin");
    expect(result.storePolicyVersion).toBe(3);
    expect(result.typed.join.message.recipients).toEqual([
      { to: getAddress(CREATOR_WALLET), bps: 9500, role: 0 },
      { to: getAddress(TREASURY), bps: 500, role: 1 },
    ]);
    expect(result.typed.join.message.periodSeconds).toBe(30 * 86400);
    // 12 periods every 30 days
    expect(result.allowance).toBe("60000000");
    expect(result.typed.permit.message).toMatchObject({
      spender: CONTRACT,
      nonce: "4",
      value: "60000000",
    });
    expect(created).toMatchObject({
      status: "prepared",
      planVersion: 2,
      storePolicyVersionId: Buffer.alloc(16, 9),
    });
  });

  it("adds the promoter row from ?via= to the stored table, paid on every renewal (C12)", async () => {
    promo.calls = [];
    promo.value = {
      codeId: Buffer.alloc(16, 7),
      promoterUserId: 30,
      handle: "sam",
      to: getAddress("0xd000000000000000000000000000000000000004"),
      bps: 1_000,
    };
    const result = await prepareJoin(
      FAN,
      { handle: "maya", interval: "every_30_days", via: "SAM10" },
      NOW
    );
    promo.value = null;
    if (result.refused) throw new Error(result.reason);
    expect(result.typed.join.message.recipients).toEqual([
      { to: getAddress(CREATOR_WALLET), bps: 8500, role: 0 },
      { to: getAddress(TREASURY), bps: 500, role: 1 },
      { to: getAddress("0xd000000000000000000000000000000000000004"), bps: 1000, role: 2 },
    ]);
    expect(result.promoterHandle).toBe("sam");
    expect(result.fee).toBe("250000");
    expect(created).toMatchObject({ promoterCodeId: Buffer.alloc(16, 7) });
    expect(promo.calls[0]).toMatchObject({ via: "SAM10", buyerUserId: FAN, screen: true });
  });

  it("asks one permit for every membership the fan has", async () => {
    db.membership.findMany.mockResolvedValueOnce([
      { pricePerPeriod: 10_000_000n, interval: "yearly" },
    ]);
    expect(await allowanceFor(FAN, { price: 5_000_000n, interval: "every_30_days" })).toBe(
      80_000_000n
    );
  });

  it("refuses the creator's own plan, a current member, a lapsed seller and a short wallet", async () => {
    expect(await prepareJoin(MAYA, { handle: "maya", interval: "every_30_days" }, NOW)).toEqual({
      refused: true,
      reason: "own_plan",
    });
    db.membership.findFirst.mockResolvedValueOnce({ id: Buffer.alloc(16, 1) });
    expect(await prepareJoin(FAN, { handle: "maya", interval: "every_30_days" }, NOW)).toEqual({
      refused: true,
      reason: "already_member",
    });
    chain.seller = false;
    expect(await prepareJoin(FAN, { handle: "maya", interval: "every_30_days" }, NOW)).toEqual({
      refused: true,
      reason: "seller",
    });
    chain.seller = true;
    chain.balance = 1_000_000n;
    expect(await prepareJoin(FAN, { handle: "maya", interval: "every_30_days" }, NOW)).toEqual({
      refused: true,
      reason: "insufficient_balance",
      shortBy: "4000000",
    });
  });

  it("sends a join signed by the fan once, with the permit for every period", async () => {
    const prepared = await prepareJoin(FAN, { handle: "maya", interval: "every_30_days" }, NOW);
    const signed = await signJoin(prepared);
    chain.receipt = { status: "failure", logs: [], blockNumber: 1n };
    const result = await submitJoin(FAN, signed, NOW, 0);
    const [to, data, key] = chain.relayer.mock.calls[0];
    expect(to).toBe(CONTRACT);
    expect(key).toBe(`join:${signed.membershipId}`);
    const call = decodeFunctionData({ abi: AMPEDMEMBERSHIPS_ABI, data });
    expect(call.functionName).toBe("join");
    expect((call.args![0] as { member: string }).member).toBe(fanKey.address);
    expect(call.args![3]).toBe(60_000_000n);
    expect(result).toMatchObject({ refused: false, txHash: "0xfeed" });
  });

  it("refuses a join signed by any other wallet and sends nothing", async () => {
    const prepared = await prepareJoin(FAN, { handle: "maya", interval: "every_30_days" }, NOW);
    const signed = await signJoin(prepared, otherKey);
    expect(await submitJoin(FAN, signed, NOW, 0)).toEqual({ refused: true, reason: "signature" });
    expect(chain.relayer).not.toHaveBeenCalled();
  });

  it("splits like the contract", () => {
    const rows = joinRecipients(CREATOR_WALLET, TREASURY, 500);
    expect(periodFee(5_000_001n, rows)).toBe(250_000n);
  });
});

describe("cancel", () => {
  const active = () => ({
    id: Buffer.alloc(16, 8),
    fanUserId: FAN,
    member: fanKey.address,
    chainId: 84532,
    status: "active",
    currentPeriodEnd: new Date(NOW.getTime() + 10 * DAY),
  });

  it("stops charges with one signature and keeps access to the period end", async () => {
    db.membership.findUnique.mockResolvedValue(active());
    const prepared = await prepareCancel(FAN, "08".repeat(16), NOW);
    if (prepared.refused) throw new Error("refused");
    const signature = await fanKey.signTypedData({
      domain: prepared.typed.domain,
      types: MEMBERSHIP_CANCEL_TYPES,
      primaryType: "Cancel",
      message: {
        subscriptionRef: prepared.typed.message.subscriptionRef,
        deadline: BigInt(prepared.typed.message.deadline),
      },
    });
    const result = await submitCancel(
      FAN,
      { membershipId: "08".repeat(16), deadline: prepared.typed.message.deadline, signature },
      NOW
    );
    expect(result).toMatchObject({ refused: false, status: "canceled" });
    expect(
      decodeFunctionData({ abi: AMPEDMEMBERSHIPS_ABI, data: chain.relayer.mock.calls[0][1] })
        .functionName
    ).toBe("cancelWithSignature");
    expect(
      accessUntil(
        { status: "canceled", currentPeriodEnd: active().currentPeriodEnd, pastDueSince: null },
        NOW
      )
    ).toEqual(active().currentPeriodEnd);
  });

  it("refuses a cancel signed by someone else", async () => {
    db.membership.findUnique.mockResolvedValue(active());
    const prepared = await prepareCancel(FAN, "08".repeat(16), NOW);
    if (prepared.refused) throw new Error("refused");
    const signature = await otherKey.signTypedData({
      domain: prepared.typed.domain,
      types: MEMBERSHIP_CANCEL_TYPES,
      primaryType: "Cancel",
      message: {
        subscriptionRef: prepared.typed.message.subscriptionRef,
        deadline: BigInt(prepared.typed.message.deadline),
      },
    });
    expect(
      await submitCancel(
        FAN,
        { membershipId: "08".repeat(16), deadline: prepared.typed.message.deadline, signature },
        NOW
      )
    ).toEqual({ refused: true, reason: "signature" });
  });
});

describe("access", () => {
  it("opens for active, past due inside the grace, and canceled to the period end", async () => {
    const until = new Date(NOW.getTime() + DAY);
    db.membership.findFirst.mockResolvedValueOnce({
      status: "past_due",
      pastDueSince: new Date(NOW.getTime() - 3 * DAY),
      currentPeriodEnd: null,
    });
    expect(await isMember(FAN, MAYA, NOW)).toBe(true);
    db.membership.findFirst.mockResolvedValueOnce({
      status: "past_due",
      pastDueSince: new Date(NOW.getTime() - 8 * DAY),
      currentPeriodEnd: null,
    });
    expect(await isMember(FAN, MAYA, NOW)).toBe(false);
    db.membership.findFirst.mockResolvedValueOnce({
      status: "canceled",
      currentPeriodEnd: until,
      pastDueSince: null,
    });
    expect(await isMember(FAN, MAYA, NOW)).toBe(true);
    db.membership.findFirst.mockResolvedValueOnce({
      status: "ended",
      currentPeriodEnd: until,
      pastDueSince: null,
    });
    expect(await isMember(FAN, MAYA, NOW)).toBe(false);
  });
});

function renewalRow(over: Record<string, unknown> = {}) {
  return {
    id: Buffer.alloc(16, 8),
    fanUserId: FAN,
    creatorUserId: MAYA,
    member: fanKey.address,
    interval: "every_30_days",
    pricePerPeriod: 5_000_000n,
    status: "active",
    chargeCount: 1,
    currentPeriodEnd: new Date(NOW.getTime() - 60_000),
    pastDueSince: null,
    notReadyAt: null,
    lastReminderDay: null,
    renewalPausedAt: null,
    ...over,
  };
}

describe("renewals", () => {
  it("reminds once, 3 days before, when the allowance is short", async () => {
    db.membership.findMany.mockResolvedValueOnce([
      renewalRow({ currentPeriodEnd: new Date(NOW.getTime() + 2 * DAY) }),
    ]);
    chain.allowance = 1_000_000n;
    expect(await readinessOnce(CONTRACT, NOW)).toBe(1);
    expect(db.notification.create.mock.calls[0][0].data).toMatchObject({
      kind: "MEMBERSHIP_RENEWAL",
      groupKey: `renewal:${"08".repeat(16)}`,
    });
    expect(sendPush).toHaveBeenCalledWith(
      FAN,
      expect.objectContaining({ url: addUsdcPath(5_000_000n) })
    );
    expect(deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["fan@example.com"],
        subject: "Your Maya Lin membership renews in 3 days",
      })
    );
  });

  it("says nothing when the wallet is ready", async () => {
    db.membership.findMany.mockResolvedValueOnce([
      renewalRow({ currentPeriodEnd: new Date(NOW.getTime() + 2 * DAY) }),
    ]);
    expect(await readinessOnce(CONTRACT, NOW)).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("charges what is due through the relayer", async () => {
    db.membership.findMany.mockResolvedValueOnce([renewalRow()]);
    chain.receipt = { status: "success", logs: [], blockNumber: 2n };
    await chargeOnce(CONTRACT, NOW);
    const call = decodeFunctionData({
      abi: AMPEDMEMBERSHIPS_ABI,
      data: chain.relayer.mock.calls[0][1],
    });
    expect(call).toMatchObject({
      functionName: "renew",
      args: [membershipRef(Buffer.alloc(16, 8))],
    });
  });

  it("applies a charge that already landed instead of charging again", async () => {
    db.membership.findMany.mockResolvedValueOnce([renewalRow()]);
    chain.sub = { nextDue: 1_796_000_000n, charges: 2, active: true };
    expect(await chargeOnce(CONTRACT, NOW)).toBe(1);
    expect(chain.relayer).not.toHaveBeenCalled();
    expect(db.membership.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "active",
      chargeCount: 2,
      pastDueSince: null,
    });
  });

  it("makes a reverted renewal past due from the missed date", async () => {
    const row = renewalRow();
    db.membership.findMany.mockResolvedValueOnce([row]);
    const { RelayerError } = await import("../services/usdc/relayer");
    chain.relayer.mockRejectedValueOnce(
      new (RelayerError as unknown as new (c: string) => Error)("reverted")
    );
    await chargeOnce(CONTRACT, NOW);
    expect(db.membership.updateMany.mock.calls[0][0].data).toEqual({
      status: "past_due",
      pastDueSince: row.currentPeriodEnd,
    });
  });

  it("reminds on day 1, 3 and 6 of the grace, once each", async () => {
    db.membership.findMany.mockResolvedValueOnce([
      renewalRow({
        status: "past_due",
        pastDueSince: new Date(NOW.getTime() - 2.5 * DAY),
        lastReminderDay: 1,
      }),
    ]);
    expect(await graceOnce(NOW)).toBe(1);
    expect(db.membership.updateMany.mock.calls[0][0].data).toEqual({ lastReminderDay: 3 });
    db.membership.findMany.mockResolvedValueOnce([
      renewalRow({
        status: "past_due",
        pastDueSince: new Date(NOW.getTime() - 3.5 * DAY),
        lastReminderDay: 3,
      }),
    ]);
    expect(await graceOnce(NOW)).toBe(0);
  });

  it("ends on day 7 through endByPlatform", async () => {
    db.membership.findMany.mockResolvedValueOnce([
      renewalRow({ status: "past_due", pastDueSince: new Date(NOW.getTime() - 7 * DAY) }),
    ]);
    db.membership.findUnique.mockResolvedValueOnce({ id: Buffer.alloc(16, 8), status: "past_due" });
    expect(await graceOnce(NOW)).toBe(1);
    expect(
      decodeFunctionData({ abi: AMPEDMEMBERSHIPS_ABI, data: chain.relayer.mock.calls[0][1] })
        .functionName
    ).toBe("endByPlatform");
    expect(db.membership.updateMany.mock.calls[0][0].data).toMatchObject({
      status: "ended",
      endReason: "past_due",
    });
  });

  it("pauses renewals for a lapsed seller and resumes when they pass", async () => {
    db.membership.findMany.mockResolvedValueOnce([
      {
        id: Buffer.alloc(16, 8),
        creatorUserId: MAYA,
        renewalPausedAt: null,
        currentPeriodEnd: new Date(NOW.getTime() + DAY),
      },
    ]);
    chain.seller = false;
    expect(await sellerPassOnce(NOW)).toBe(1);
    expect(db.membership.update.mock.calls[0][0].data).toEqual({ renewalPausedAt: NOW });
    chain.seller = true;
    db.membership.findMany.mockResolvedValueOnce([
      {
        id: Buffer.alloc(16, 8),
        creatorUserId: MAYA,
        renewalPausedAt: NOW,
        currentPeriodEnd: new Date(NOW.getTime() + DAY),
      },
    ]);
    expect(await sellerPassOnce(NOW)).toBe(1);
    expect(db.membership.update.mock.calls[1][0].data).toEqual({ renewalPausedAt: null });
  });

  it("ends canceled memberships when their period does", async () => {
    db.membership.updateMany.mockResolvedValueOnce({ count: 2 });
    expect(await closeCanceledOnce(NOW)).toBe(2);
    expect(db.membership.updateMany.mock.calls[0][0]).toMatchObject({
      where: { status: "canceled" },
      data: { status: "ended", endReason: "member_canceled" },
    });
  });
});
