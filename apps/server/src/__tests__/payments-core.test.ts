/**
 * AmpedPay payments core (PAY-2): the split table, prepare, submit, settle and the payment
 * log indexer. The database, the chain, screening, the relayer and email are faked; the
 * split signer and the fan are real local keys so every signature is checked for real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  stringToHex,
  toHex,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

type Row = Record<string, any>;

const CONTRACT = getAddress("0xa000000000000000000000000000000000000001");
const TREASURY = getAddress("0xb000000000000000000000000000000000000002");
const CREATOR = getAddress("0xc000000000000000000000000000000000000003");
const USDC = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
const INTENT = "0e".repeat(16);

const signerKey = generatePrivateKey();
const fanKey = generatePrivateKey();
const signerAccount = privateKeyToAccount(signerKey);
const fan = privateKeyToAccount(fanKey);

const state = vi.hoisted(() => ({
  offerPeriodDays: null as number | null,
  purchases: [] as Record<string, any>[],
  intents: [] as Record<string, any>[],
  events: [] as Record<string, any>[],
  settings: new Map<string, Record<string, any>>(),
  balance: 0n,
  screenAllowed: true,
  contract: null as Record<string, any> | null,
  head: 100n,
  receipt: null as Record<string, any> | null,
  logs: [] as Record<string, any>[],
  fanWallet: "",
  ready: true,
  item: true,
  pay: {} as Record<string, any>,
  // C12: what resolvePromoter returns, and what it was asked
  promoter: null as Record<string, any> | null,
  promoterCalls: [] as Record<string, any>[],
  live: null as Record<string, any> | null,
}));

vi.mock("../services/store/promoters", () => ({
  resolvePromoter: vi.fn(async (input: Record<string, any>) => {
    state.promoterCalls.push(input);
    return state.promoter;
  }),
}));

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as Row[]).some(c => matches(row, c));
    const value = row[key];
    if (Buffer.isBuffer(condition)) return Buffer.isBuffer(value) && condition.equals(value);
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return condition.in.includes(value);
      if ("notIn" in condition) return !condition.notIn.includes(value);
      if ("not" in condition)
        return condition.not === null ? value !== null : value !== condition.not;
      if ("gte" in condition) return value >= condition.gte;
      if ("gt" in condition) return value !== null && value > condition.gt;
      if ("lt" in condition) return value < condition.lt;
      return true;
    }
    return value === condition;
  });
}

vi.mock("@repo/database", () => {
  const purchase = {
    findUnique: vi.fn(async ({ where, select }: Row) => {
      const row = state.purchases.find(r => r.id.equals(where.id)) ?? null;
      if (row && select?.buyer) {
        return {
          ...row,
          buyer: { email: "fan@example.com", name: "Fan Person" },
          creator: { handle: "maya" },
        };
      }
      return row;
    }),
    findFirst: vi.fn(
      async ({ where }: Row) => state.purchases.find(r => matches(r, where)) ?? null
    ),
    findMany: vi.fn(async ({ where }: Row) => state.purchases.filter(r => matches(r, where))),
    create: vi.fn(async ({ data }: Row) => {
      const row = {
        txHash: null,
        failureCode: null,
        blockNumber: null,
        blockHash: null,
        accessUntil: null,
        softConfirmedAt: null,
        confirmedAt: null,
        receiptSentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      state.purchases.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: Row) => {
      const row = state.purchases.find(r => r.id.equals(where.id))!;
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: Row) => {
      const rows = state.purchases.filter(r => matches(r, where));
      rows.forEach(r => Object.assign(r, data, { updatedAt: new Date() }));
      return { count: rows.length };
    }),
    count: vi.fn(async ({ where }: Row) => state.purchases.filter(r => matches(r, where)).length),
    aggregate: vi.fn(async ({ where }: Row) => ({
      _sum: {
        amount: state.purchases
          .filter(r => matches(r, where))
          .reduce((sum, r) => sum + r.amount, 0n as bigint),
      },
    })),
  };
  return {
    prisma: {
      purchase,
      checkoutIntent: {
        findUnique: vi.fn(
          async ({ where }: Row) => state.intents.find(r => r.id.equals(where.id)) ?? null
        ),
        updateMany: vi.fn(async ({ where, data }: Row) => {
          const rows = state.intents.filter(r => matches(r, where));
          rows.forEach(r => Object.assign(r, data));
          return { count: rows.length };
        }),
        update: vi.fn(async ({ where, data }: Row) => {
          const row = state.intents.find(r => r.id.equals(where.id))!;
          Object.assign(row, data);
          return row;
        }),
      },
      // CK-5: the live store policy version the intent carries
      storePolicyVersion: { findUnique: vi.fn(async () => state.live) },
      userWallet: { findUnique: vi.fn(async () => ({ address: CREATOR })) },
      user: {
        findUnique: vi.fn(async () => ({
          wallet: state.fanWallet ? { address: state.fanWallet } : null,
        })),
      },
      contentItem: {
        findUnique: vi.fn(async () => ({ title: "Episode 4", publicId: "abc123" })),
      },
      // C10: the live store policy at prepare and the product sales count
      storeSettings: {
        findUnique: vi.fn(async () => (state.live ? { livePolicyVersionId: state.live.id } : null)),
      },
      offer: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        // G4: the product's access period at the first confirmation
        findUnique: vi.fn(async () => ({ accessPeriodDays: state.offerPeriodDays })),
      },
      siteSettings: {
        findUnique: vi.fn(async ({ where }: Row) => state.settings.get(where.setting_key) ?? null),
        upsert: vi.fn(async ({ where, create, update }: Row) => {
          const row = { ...(state.settings.get(where.setting_key) ?? create), ...update };
          state.settings.set(where.setting_key, row);
          return row;
        }),
      },
      paymentEvent: {
        create: vi.fn(async ({ data }: Row) => {
          if (state.events.some(e => e.txHash === data.txHash && e.logIndex === data.logIndex)) {
            throw Object.assign(new Error("dup"), { code: "P2002" });
          }
          state.events.push(data);
          return data;
        }),
      },
    },
  };
});

const SETTINGS = {
  paymentsPaused: false,
  platformFeeBps: 500,
  oneTimePriceMin: 500_000n,
  oneTimePriceMax: 1_000_000_000n,
  quoteWindowSeconds: 600,
  softUnlockConfirmations: 1,
  finalConfirmations: 12,
  purchasesPerDayPerAccount: 20,
  purchaseUsdcPerDayPerAccount: 2_000_000_000n,
  refundWindowDays: 30,
  pilotOnly: false,
  pilotCreators: [] as string[],
};
const settings = { ...SETTINGS };

vi.mock("../services/payments/settings", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/payments/settings")>()),
  paymentSettings: vi.fn(async () => settings),
}));

vi.mock("../services/payments/onchain", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/payments/onchain")>()),
  ampedPayAddress: vi.fn(() => CONTRACT),
  readContractState: vi.fn(async () =>
    state.contract ? { ok: true, value: state.contract } : { ok: false, reason: "rpc" }
  ),
}));

vi.mock("../services/payments/ready", () => ({ paymentsReady: vi.fn(() => state.ready) }));

const client = {
  getTransactionReceipt: vi.fn(async () => {
    if (!state.receipt) throw new Error("not found");
    return state.receipt;
  }),
  waitForTransactionReceipt: vi.fn(async () => {
    if (!state.receipt) throw new Error("timeout");
    return state.receipt;
  }),
  getBlockNumber: vi.fn(async () => state.head),
  getBlock: vi.fn(async () => ({ timestamp: 1_790_000_000n })),
  getLogs: vi.fn(async () => state.logs),
};

vi.mock("../services/usdc/chain", () => ({
  paymentChain: baseSepolia,
  paymentClient: () => client,
  getUsdcBalance: vi.fn(async () => state.balance),
  usdcDomain: vi.fn(async () => ({
    name: "USDC",
    version: "2",
    chainId: baseSepolia.id,
    verifyingContract: USDC,
  })),
}));

vi.mock("../services/usdc/screen", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/usdc/screen")>()),
  screenAddress: vi.fn(async () =>
    state.screenAllowed
      ? { allowed: true, checkedBy: ["circle"] }
      : { allowed: false, checkedBy: ["circle"], deniedBy: "circle" }
  ),
}));

const relayerCall = vi.fn(async (..._args: unknown[]) => "0x" + "ab".repeat(32));
vi.mock("../services/usdc/relayer", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/usdc/relayer")>()),
  getRelayer: () => ({ call: relayerCall }),
  isRelayerConfigured: () => true,
}));

vi.mock("../services/checkout/intents", async importOriginal => ({
  ...(await importOriginal<typeof import("../services/checkout/intents")>()),
  resolveTarget: vi.fn(async () =>
    state.item
      ? {
          creatorUserId: 10,
          item: { title: "Episode 4", creatorHandle: "maya", creatorName: "Maya" },
          extra: {},
        }
      : null
  ),
}));

vi.mock("../services/checkout/quote", () => ({
  checkoutAmount: vi.fn(async () => 3_000_000n),
}));

const deliverEmail = vi.fn(async (..._args: unknown[]) => ({ transport: "test" }));
vi.mock("../utils/email/transport", () => ({
  deliverEmail: (...a: unknown[]) => deliverEmail(...a),
}));

// AB-6: the seller gate runs at prepare, not only in the quote
const sellerIdentity = vi.hoisted(() => ({ pass: true, reason: null as string | null }));
vi.mock("../services/identity/checks", () => ({
  checkIdentity: vi.fn(async () =>
    sellerIdentity.pass
      ? { pass: true, tier: "ENHANCED", validUntil: new Date(Date.now() + 86_400_000) }
      : { pass: false, reason: sellerIdentity.reason ?? "needs_enhanced" }
  ),
}));

import {
  AMPEDPAY_ABI,
  RECEIVE_WITH_AUTHORIZATION_TYPES,
  SPLIT_ROLES,
  purchaseIdFromPaymentRef,
  purchasePaymentRef,
} from "@repo/web3";
import {
  BPS,
  SplitRuleError,
  assertSplitRules,
  buildSplit,
  hashSplit,
  isSplitSignedBy,
  setSplitSignerForTests,
  splitShares,
  type SplitTable,
} from "../services/payments/split";
import { contractLimits } from "../services/payments/settings";
import {
  hexToPurchaseId,
  preparePurchase,
  purchaseForIntent,
  purchaseStatus,
  purchasedTargets,
  settlePurchase,
  submitPurchase,
} from "../services/payments/purchases";
import {
  indexPaymentLogsOnce,
  nextPaymentsRange,
  settlePendingOnce,
} from "../services/payments/paymentsWorker";

const limits = contractLimits();
const NOW = new Date("2026-11-03T12:00:00Z");
const NOW_S = BigInt(NOW.getTime() / 1000);

function contractState(overrides: Row = {}) {
  return {
    address: CONTRACT,
    paused: false,
    feeFloorBps: 500,
    minCreatorBps: 5000,
    maxRecipients: 6,
    maxSplitValidity: 3600,
    minPayment: 500_000n,
    maxPayment: 1_000_000_000n,
    treasury: TREASURY,
    splitSigner: signerAccount.address,
    ...overrides,
  };
}

function split(overrides: Partial<SplitTable> = {}): SplitTable {
  return {
    ...buildSplit({
      paymentRef: purchasePaymentRef("01".repeat(16)),
      payer: fan.address,
      amount: 3_000_000n,
      creator: CREATOR,
      treasury: TREASURY,
      platformFeeBps: 500,
      validBefore: NOW_S + 600n,
    }),
    ...overrides,
  };
}

/** The digest exactly as AmpedPay.hashSplit computes it, built by hand from the Solidity. */
function solidityHash(table: SplitTable): Hex {
  const RECIPIENT_TYPEHASH = keccak256(stringToHex("Recipient(address to,uint16 bps,uint8 role)"));
  const SPLIT_TYPEHASH = keccak256(
    stringToHex(
      "SplitTable(bytes32 paymentRef,address payer,uint256 amount,Recipient[] recipients,uint64 validBefore)Recipient(address to,uint16 bps,uint8 role)"
    )
  );
  const DOMAIN_TYPEHASH = keccak256(
    stringToHex(
      "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    )
  );
  const hashes = table.recipients.map(r =>
    keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint16" }, { type: "uint8" }],
        [RECIPIENT_TYPEHASH, r.to, r.bps, r.role]
      )
    )
  );
  const recipientsHash = keccak256(`0x${hashes.map(h => h.slice(2)).join("")}`);
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint64" },
      ],
      [
        SPLIT_TYPEHASH,
        table.paymentRef,
        table.payer,
        table.amount,
        recipientsHash,
        table.validBefore,
      ]
    )
  );
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        DOMAIN_TYPEHASH,
        keccak256(stringToHex("AmpedPay")),
        keccak256(stringToHex("1")),
        BigInt(baseSepolia.id),
        CONTRACT,
      ]
    )
  );
  return keccak256(`0x1901${domainSeparator.slice(2)}${structHash.slice(2)}`);
}

describe("split table", () => {
  it("hashes exactly as the contract does", () => {
    const table = split();
    expect(hashSplit(table, baseSepolia.id, CONTRACT)).toBe(solidityHash(table));
  });

  it("gives the creator the remainder and the platform its bps", () => {
    const table = split({ amount: 3_333_333n });
    expect(table.recipients.map(r => [r.role, r.bps])).toEqual([
      [SPLIT_ROLES.creator, 9_500],
      [SPLIT_ROLES.platform, 500],
    ]);
    const shares = splitShares(table);
    expect(shares.find(s => s.role === SPLIT_ROLES.platform)!.amount).toBe(166_666n);
    expect(shares.find(s => s.role === SPLIT_ROLES.creator)!.amount).toBe(3_166_667n);
    expect(shares.reduce((sum, s) => sum + s.amount, 0n)).toBe(3_333_333n);
  });

  it("passes a valid table and names each broken rule", () => {
    const ok = split();
    expect(() => assertSplitRules(ok, limits, TREASURY, NOW_S)).not.toThrow();
    const broken = (table: SplitTable) => {
      try {
        assertSplitRules(table, limits, TREASURY, NOW_S);
        return null;
      } catch (error) {
        return (error as SplitRuleError).rule;
      }
    };
    const recipients = ok.recipients;
    expect(broken({ ...ok, validBefore: NOW_S })).toBe("expired");
    expect(broken({ ...ok, validBefore: NOW_S + 3601n })).toBe("validity_too_long");
    expect(broken({ ...ok, amount: 499_999n })).toBe("amount_out_of_range");
    expect(broken({ ...ok, paymentRef: toHex(0, { size: 32 }) })).toBe("zero_payment_ref");
    expect(broken({ ...ok, recipients: [recipients[0]!] })).toBe("recipient_count");
    expect(broken({ ...ok, recipients: [{ ...recipients[0]!, bps: 9_000 }, recipients[1]!] })).toBe(
      "bps_sum"
    );
    expect(
      broken({
        ...ok,
        recipients: [recipients[0]!, { ...recipients[1]!, to: CREATOR }],
      })
    ).toBe("duplicate_recipient");
    expect(
      broken({
        ...ok,
        recipients: [recipients[0]!, { ...recipients[1]!, to: getAddress("0x" + "d".repeat(40)) }],
      })
    ).toBe("platform_not_treasury");
    expect(
      broken({
        ...ok,
        recipients: [
          { ...recipients[0]!, bps: 9_600 },
          { ...recipients[1]!, bps: 400 },
        ],
      })
    ).toBe("platform_bps");
    expect(
      broken({
        ...ok,
        recipients: [
          { ...recipients[0]!, bps: 4_000 },
          { ...recipients[1]!, bps: 1_000 },
          {
            to: getAddress("0x" + "e".repeat(40)),
            bps: 5_000,
            role: SPLIT_ROLES.partner,
          },
        ],
      })
    ).toBe("creator_bps");
    expect(
      broken({ ...ok, recipients: [{ ...recipients[0]!, to: fan.address }, recipients[1]!] })
    ).toBe("payer_is_recipient");
    expect(BPS).toBe(10_000);
  });

  it("allows a merchant row at 20% and keeps a creator row capped at 10% (M11)", () => {
    const ok = split();
    const broken = (table: SplitTable) => {
      try {
        assertSplitRules(table, limits, TREASURY, NOW_S);
        return null;
      } catch (error) {
        return (error as SplitRuleError).rule;
      }
    };
    const merchant = (platformBps: number): SplitTable => ({
      ...ok,
      recipients: [
        { ...ok.recipients[0]!, bps: 10_000 - platformBps, role: SPLIT_ROLES.merchant },
        { ...ok.recipients[1]!, bps: platformBps },
      ],
    });
    expect(broken(merchant(2_000))).toBeNull();
    expect(broken(merchant(2_001))).toBe("platform_bps");
    expect(broken(merchant(499))).toBe("platform_bps");
    expect(
      broken({
        ...ok,
        recipients: [
          { ...ok.recipients[0]!, bps: 8_000 },
          { ...ok.recipients[1]!, bps: 2_000 },
        ],
      })
    ).toBe("platform_bps");
    expect(
      broken({
        ...ok,
        recipients: [
          { ...ok.recipients[0]!, bps: 5_000 },
          { to: getAddress("0x" + "e".repeat(40)), bps: 5_000, role: SPLIT_ROLES.merchant },
        ],
      })
    ).toBe("creator_count");
    expect(
      broken({
        ...ok,
        recipients: [
          { ...ok.recipients[0]!, bps: 5_000, role: SPLIT_ROLES.merchant },
          { to: getAddress("0x" + "e".repeat(40)), bps: 5_000, role: SPLIT_ROLES.merchant },
        ],
      })
    ).toBe("merchant_count");

    const built = buildSplit({
      paymentRef: ok.paymentRef,
      payer: ok.payer,
      amount: 10_000_000n,
      creator: CREATOR,
      treasury: TREASURY,
      platformFeeBps: 2_000,
      validBefore: ok.validBefore,
      sellerRole: SPLIT_ROLES.merchant,
    });
    expect(built.recipients.map(r => [r.role, r.bps])).toEqual([
      [SPLIT_ROLES.merchant, 8_000],
      [SPLIT_ROLES.platform, 2_000],
    ]);
    const shares = splitShares(built);
    expect(shares.find(r => r.role === SPLIT_ROLES.merchant)!.amount).toBe(8_000_000n);
    expect(shares.find(r => r.role === SPLIT_ROLES.platform)!.amount).toBe(2_000_000n);
  });

  it("checks the split signer against the contract's signer", async () => {
    const table = split();
    const signature = await signerAccount.signTypedData({
      domain: {
        name: "AmpedPay",
        version: "1",
        chainId: baseSepolia.id,
        verifyingContract: CONTRACT,
      },
      types: {
        SplitTable: [
          { name: "paymentRef", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "recipients", type: "Recipient[]" },
          { name: "validBefore", type: "uint64" },
        ],
        Recipient: [
          { name: "to", type: "address" },
          { name: "bps", type: "uint16" },
          { name: "role", type: "uint8" },
        ],
      },
      primaryType: "SplitTable",
      message: table,
    });
    expect(
      await isSplitSignedBy(table, baseSepolia.id, CONTRACT, signature, signerAccount.address)
    ).toBe(true);
    expect(await isSplitSignedBy(table, baseSepolia.id, CONTRACT, signature, fan.address)).toBe(
      false
    );
  });

  it("maps a purchase id to its paymentRef and back", () => {
    const id = "0193f0e0aaaa7bbbb8cccc0123456789";
    const ref = purchasePaymentRef(id);
    expect(ref).toBe(`0x${"0".repeat(32)}${id}`);
    expect(purchaseIdFromPaymentRef(ref)).toBe(id);
    expect(purchaseIdFromPaymentRef(`0x${"1".repeat(64)}`)).toBeNull();
  });
});

const localSigner = {
  address: async () => signerAccount.address,
  sign: async (table: SplitTable, chainId: number, contract: Address) =>
    signerAccount.signTypedData({
      domain: { name: "AmpedPay", version: "1", chainId, verifyingContract: contract },
      types: {
        SplitTable: [
          { name: "paymentRef", type: "bytes32" },
          { name: "payer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "recipients", type: "Recipient[]" },
          { name: "validBefore", type: "uint64" },
        ],
        Recipient: [
          { name: "to", type: "address" },
          { name: "bps", type: "uint16" },
          { name: "role", type: "uint8" },
        ],
      },
      primaryType: "SplitTable",
      message: table,
    }),
};

beforeEach(() => {
  Object.assign(settings, SETTINGS);
  state.offerPeriodDays = null;
  state.purchases = [];
  state.events = [];
  state.settings = new Map();
  state.intents = [
    {
      id: Buffer.from(INTENT, "hex"),
      targetType: "content",
      targetId: "abc123",
      creatorUserId: 10,
      userId: 20,
      status: "open",
      expiresAt: new Date(NOW.getTime() + 3_600_000),
    },
  ];
  state.balance = 10_000_000n;
  state.screenAllowed = true;
  state.contract = contractState();
  state.head = 100n;
  state.receipt = null;
  state.logs = [];
  state.fanWallet = fan.address;
  state.ready = true;
  state.item = true;
  state.promoter = null;
  state.promoterCalls = [];
  state.live = null;
  relayerCall.mockClear();
  deliverEmail.mockClear();
  sellerIdentity.pass = true;
  sellerIdentity.reason = null;
  setSplitSignerForTests(localSigner);
});

const prepare = (overrides: Row = {}) =>
  preparePurchase(20, { intentId: INTENT, amount: "3000000", ...overrides }, NOW);

describe("preparePurchase", () => {
  it("refuses a creator who no longer passes the seller gate (AB-6)", async () => {
    sellerIdentity.pass = false;
    sellerIdentity.reason = "needs_enhanced";
    expect(await prepare({ signer: fan.address })).toEqual({
      refused: true,
      reason: "seller",
    });
    expect(state.purchases).toHaveLength(0);
    sellerIdentity.pass = true;
  });

  it("adds the promoter row when the intent's code attributes, and stores the code (C12)", async () => {
    const PROMOTER = getAddress("0xd000000000000000000000000000000000000004");
    state.intents[0]!.via = "MAYA2026";
    state.promoter = {
      codeId: Buffer.from("0c".repeat(16), "hex"),
      promoterUserId: 30,
      handle: "sam",
      to: PROMOTER,
      bps: 1_000,
    };
    const result = await prepare({ signer: fan.address });
    if (result.refused) throw new Error(`refused ${result.reason}`);
    const row = state.purchases[0]!;
    expect(row.split.recipients).toEqual([
      { to: CREATOR, bps: 8_500, role: 0 },
      { to: TREASURY, bps: 500, role: 1 },
      { to: PROMOTER, bps: 1_000, role: 2 },
    ]);
    expect(row.promoterCodeId).toEqual(Buffer.from("0c".repeat(16), "hex"));
    expect(row.fee).toBe(150_000n);
    expect(result.review.promoterHandle).toBe("sam");
    expect(state.promoterCalls[0]).toMatchObject({
      via: "MAYA2026",
      creatorUserId: 10,
      buyerUserId: 20,
      targetId: null,
      screen: true,
    });
    // The signed table is the one the contract will hash
    expect(row.splitHash).toBe(
      solidityHash({
        paymentRef: purchasePaymentRef(row.id),
        payer: fan.address,
        amount: 3_000_000n,
        recipients: row.split.recipients,
        validBefore: BigInt(row.split.validBefore),
      })
    );
  });

  it("sells without a promoter row when no code attributes", async () => {
    state.intents[0]!.via = "NOPE1234";
    const result = await prepare({ signer: fan.address });
    if (result.refused) throw new Error(`refused ${result.reason}`);
    expect(state.purchases[0]!.split.recipients).toHaveLength(2);
    expect(state.purchases[0]!.promoterCodeId).toBeNull();
    expect(result.review.promoterHandle).toBeNull();
  });

  it("signs the split and returns the authorization to sign: to AmpedPay, nonce the split hash", async () => {
    const result = await prepare({ signer: fan.address });
    if (result.refused) throw new Error(`refused ${result.reason}`);
    const row = state.purchases[0]!;
    expect(row.status).toBe("prepared");
    expect(row.amount).toBe(3_000_000n);
    expect(row.fee).toBe(150_000n);
    expect(result.typedData.primaryType).toBe("ReceiveWithAuthorization");
    expect(result.typedData.message).toMatchObject({
      from: fan.address,
      to: CONTRACT,
      value: "3000000",
      validAfter: "0",
      validBefore: (NOW_S + 600n).toString(),
      nonce: row.splitHash,
    });
    const table = {
      paymentRef: purchasePaymentRef(row.id),
      payer: fan.address,
      amount: 3_000_000n,
      recipients: row.split.recipients,
      validBefore: BigInt(row.split.validBefore),
    };
    expect(row.splitHash).toBe(solidityHash(table));
    expect(state.intents[0]!.status).toBe("signing");
    expect(result.review).toMatchObject({
      amount: "3000000",
      fee: "150000",
      creatorHandle: "maya",
    });
  });

  it("caps the split validity at the contract's maxSplitValidity", async () => {
    settings.quoteWindowSeconds = 7200;
    const result = await prepare();
    if (result.refused) throw new Error(result.reason);
    expect(result.typedData.message.validBefore).toBe((NOW_S + 3600n).toString());
  });

  it("refuses a changed price with the new amount", async () => {
    expect(await prepare({ amount: "2000000" })).toEqual({
      refused: true,
      reason: "price",
      amount: "3000000",
    });
  });

  it("refuses when paused in settings, on chain, unreadable or not configured", async () => {
    settings.paymentsPaused = true;
    expect((await prepare()).refused && (await prepare())).toMatchObject({ reason: "paused" });
    settings.paymentsPaused = false;
    state.contract = contractState({ paused: true });
    expect(await prepare()).toMatchObject({ reason: "paused" });
    state.contract = null;
    expect(await prepare()).toMatchObject({ reason: "paused" });
    state.contract = contractState();
    state.ready = false;
    expect(await prepare()).toMatchObject({ reason: "paused" });
    expect(state.purchases).toHaveLength(0);
  });

  it("refuses when the contract's splitSigner is not ours", async () => {
    state.contract = contractState({ splitSigner: fan.address });
    expect(await prepare()).toMatchObject({ refused: true, reason: "paused" });
    expect(state.purchases).toHaveLength(0);
  });

  it("refuses a creator outside the pilot, a removed item and a short balance", async () => {
    settings.pilotOnly = true;
    expect(await prepare()).toMatchObject({ reason: "seller" });
    settings.pilotOnly = false;
    state.item = false;
    expect(await prepare()).toMatchObject({ reason: "removed" });
    state.item = true;
    state.balance = 1_000_000n;
    expect(await prepare()).toEqual({
      refused: true,
      reason: "insufficient_balance",
      shortBy: "2000000",
    });
  });

  it("refuses a different signing wallet, no wallet and a screening deny", async () => {
    expect(await prepare({ signer: CREATOR })).toMatchObject({ reason: "wallet_mismatch" });
    state.screenAllowed = false;
    expect(await prepare()).toMatchObject({ reason: "screening" });
    state.fanWallet = "";
    expect(await prepare()).toMatchObject({ reason: "no_wallet" });
  });

  it("refuses over the daily count and the daily USDC limit", async () => {
    settings.purchasesPerDayPerAccount = 1;
    state.purchases.push({
      id: hexToPurchaseId("02".repeat(16)),
      buyerUserId: 20,
      chainId: baseSepolia.id,
      status: "confirmed",
      amount: 1_000_000n,
      createdAt: NOW,
      targetType: "content",
      targetId: "other",
    });
    expect(await prepare()).toMatchObject({ reason: "limit" });
    settings.purchasesPerDayPerAccount = 20;
    settings.purchaseUsdcPerDayPerAccount = 3_500_000n;
    expect(await prepare()).toMatchObject({ reason: "limit" });
  });

  it("refuses an item the fan already owns and a payment already on its way", async () => {
    state.purchases.push({
      id: hexToPurchaseId("03".repeat(16)),
      buyerUserId: 20,
      targetType: "content",
      targetId: "abc123",
      status: "confirmed_soft",
      accessUntil: null,
      checkoutIntentId: null,
    });
    expect(await prepare()).toEqual({
      refused: true,
      reason: "owned",
      purchaseId: "03".repeat(16),
    });
    state.purchases[0]!.status = "submitted";
    state.purchases[0]!.checkoutIntentId = Buffer.from(INTENT, "hex");
    expect(await prepare()).toEqual({
      refused: true,
      reason: "in_progress",
      purchaseId: "03".repeat(16),
    });
  });

  it("lets a fan buy again once a product's access period has ended (G4)", async () => {
    state.purchases.push({
      id: hexToPurchaseId("05".repeat(16)),
      buyerUserId: 20,
      targetType: "content",
      targetId: "abc123",
      status: "confirmed",
      accessUntil: new Date(NOW.getTime() + 60_000),
      checkoutIntentId: null,
    });
    // Still inside its period: owned, the same as a lifetime purchase
    expect(await prepare()).toMatchObject({ refused: true, reason: "owned" });
    state.purchases[0]!.accessUntil = new Date(NOW.getTime() - 60_000);
    const prepared = await prepare();
    if (prepared.refused) throw new Error(prepared.reason);
    const signature = await signAuthorization(prepared);
    const result = await submitPurchase(20, { purchaseId: prepared.purchaseId, signature }, NOW, 0);
    expect(result).toMatchObject({ refused: false });
    expect(relayerCall).toHaveBeenCalledTimes(1);
  });

  it("is not found for another fan or an expired intent", async () => {
    await expect(preparePurchase(21, { intentId: INTENT, amount: "3000000" }, NOW)).rejects.toThrow(
      "This checkout has ended"
    );
    state.intents[0]!.expiresAt = new Date(NOW.getTime() - 1);
    await expect(prepare()).rejects.toThrow("This checkout has ended");
  });

  it("a second prepare expires the unsigned first one", async () => {
    await prepare();
    await prepare();
    expect(state.purchases.map(p => p.status)).toEqual(["expired", "prepared"]);
  });
});

async function signAuthorization(result: Awaited<ReturnType<typeof prepare>>, key = fan) {
  if (result.refused) throw new Error(result.reason);
  const m = result.typedData.message;
  return key.signTypedData({
    domain: result.typedData.domain,
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: m.from,
      to: m.to,
      value: BigInt(m.value),
      validAfter: BigInt(m.validAfter),
      validBefore: BigInt(m.validBefore),
      nonce: m.nonce,
    },
  });
}

function paidLogs(row: Row, blockNumber = 100n): Log[] {
  const ref = purchasePaymentRef(row.id);
  const base = {
    address: CONTRACT,
    blockHash: ("0x" + "11".repeat(32)) as Hex,
    blockNumber,
    transactionHash: ("0x" + "ab".repeat(32)) as Hex,
    transactionIndex: 0,
    removed: false,
  };
  return [
    {
      ...base,
      logIndex: 1,
      topics: encodeEventTopics({
        abi: AMPEDPAY_ABI,
        eventName: "Paid",
        args: { paymentRef: ref, payer: row.payer, creator: row.creatorAddress },
      }) as [Hex, ...Hex[]],
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "bytes32" }],
        [row.amount, row.splitHash]
      ),
    },
    {
      ...base,
      logIndex: 2,
      topics: encodeEventTopics({
        abi: AMPEDPAY_ABI,
        eventName: "Share",
        args: { paymentRef: ref, to: TREASURY },
      }) as [Hex, ...Hex[]],
      data: encodeAbiParameters([{ type: "uint8" }, { type: "uint256" }], [1, row.fee]),
    },
    {
      ...base,
      logIndex: 3,
      topics: encodeEventTopics({
        abi: AMPEDPAY_ABI,
        eventName: "Share",
        args: { paymentRef: ref, to: row.creatorAddress },
      }) as [Hex, ...Hex[]],
      data: encodeAbiParameters(
        [{ type: "uint8" }, { type: "uint256" }],
        [0, row.amount - row.fee]
      ),
    },
  ] as Log[];
}

function receiptFor(row: Row, status: "success" | "reverted" = "success", blockNumber = 100n) {
  return {
    status,
    blockNumber,
    blockHash: "0x" + "11".repeat(32),
    gasUsed: 90_000n,
    effectiveGasPrice: 1_000_000n,
    logs: status === "success" ? paidLogs(row, blockNumber) : [],
  };
}

describe("submitPurchase", () => {
  it("sends AmpedPay.pay with the signed split and the fan's authorization, then opens at soft", async () => {
    const prepared = await prepare();
    const signature = await signAuthorization(prepared);
    const row = state.purchases[0]!;
    state.receipt = receiptFor(row);
    state.head = 100n;
    const result = await submitPurchase(
      20,
      { purchaseId: (prepared as any).purchaseId, signature },
      NOW,
      0
    );
    expect(result).toMatchObject({ refused: false, status: "confirmed_soft" });
    expect(relayerCall).toHaveBeenCalledTimes(1);
    const [to, data, key] = relayerCall.mock.calls[0]! as [Address, Hex, string];
    expect(to).toBe(CONTRACT);
    expect(key).toBe((prepared as any).purchaseId);
    const decoded = decodeFunctionData({ abi: AMPEDPAY_ABI, data });
    expect(decoded.functionName).toBe("pay");
    const [table, splitSig, validAfter, validBefore, authSig] = decoded.args as any[];
    expect(table.paymentRef).toBe(purchasePaymentRef(row.id));
    expect(table.payer).toBe(fan.address);
    expect(table.amount).toBe(3_000_000n);
    expect(splitSig).toBe(row.split.signature);
    expect(validAfter).toBe(0n);
    expect(validBefore).toBe(table.validBefore);
    expect(authSig).toBe(signature);
    expect(row.status).toBe("confirmed_soft");
    expect(state.intents[0]!.status).toBe("paid");
    expect(await purchasedTargets(20, "content", ["abc123", "other"], NOW)).toEqual(
      new Set(["abc123"])
    );
  });

  it("a second tap reports the first instead of paying twice", async () => {
    const prepared = await prepare();
    const signature = await signAuthorization(prepared);
    const input = { purchaseId: (prepared as any).purchaseId, signature };
    await submitPurchase(20, input, NOW, 0);
    const again = await submitPurchase(20, input, NOW, 0);
    expect(again).toMatchObject({ refused: false, status: "submitted" });
    expect(relayerCall).toHaveBeenCalledTimes(1);
  });

  it("refuses a signature from another key and an expired split", async () => {
    const prepared = await prepare();
    const wrong = await signAuthorization(prepared, signerAccount);
    const input = { purchaseId: (prepared as any).purchaseId, signature: wrong };
    await expect(submitPurchase(20, input, NOW, 0)).rejects.toThrow("signature does not match");
    const later = new Date(NOW.getTime() + 601_000);
    await expect(submitPurchase(20, input, later, 0)).rejects.toThrow("expired");
    expect(state.purchases[0]!.status).toBe("expired");
    expect(relayerCall).not.toHaveBeenCalled();
  });

  it("another fan can't submit or read the payment", async () => {
    const prepared = await prepare();
    const signature = await signAuthorization(prepared);
    const purchaseId = (prepared as any).purchaseId;
    await expect(submitPurchase(21, { purchaseId, signature }, NOW, 0)).rejects.toThrow(
      "not found"
    );
    await expect(purchaseStatus(21, purchaseId)).rejects.toThrow("not found");
  });

  it("a relayer revert fails the purchase and reopens the intent", async () => {
    const { RelayerError } = await import("../services/usdc/relayer");
    relayerCall.mockRejectedValueOnce(new RelayerError("reverted", "would revert"));
    const prepared = await prepare();
    const signature = await signAuthorization(prepared);
    const result = await submitPurchase(
      20,
      { purchaseId: (prepared as any).purchaseId, signature },
      NOW,
      0
    );
    expect(result).toMatchObject({ refused: false, status: "failed" });
    expect(state.purchases[0]!).toMatchObject({ status: "failed", failureCode: "reverted" });
    expect(state.intents[0]!.status).toBe("open");
  });

  it("pays once when two intents for the same item are prepared and both are submitted", async () => {
    const OTHER_INTENT = "0f".repeat(16);
    state.intents.push({ ...state.intents[0]!, id: Buffer.from(OTHER_INTENT, "hex") });
    const first = await prepare();
    const second = await prepare({ intentId: OTHER_INTENT });
    const firstSig = await signAuthorization(first);
    const secondSig = await signAuthorization(second);
    await submitPurchase(
      20,
      { purchaseId: (first as any).purchaseId, signature: firstSig },
      NOW,
      0
    );
    expect(
      await submitPurchase(
        20,
        { purchaseId: (second as any).purchaseId, signature: secondSig },
        NOW,
        0
      )
    ).toEqual({ refused: true, reason: "in_progress", purchaseId: (first as any).purchaseId });
    expect(relayerCall).toHaveBeenCalledTimes(1);
    expect(state.purchases[1]!).toMatchObject({ status: "failed", failureCode: "duplicate" });
    // A third prepare on either intent sees the payment on its way
    expect(await prepare({ intentId: OTHER_INTENT })).toMatchObject({
      refused: true,
      reason: "in_progress",
    });
  });

  it("re-checks the balance before spending relayer gas", async () => {
    const prepared = await prepare();
    const signature = await signAuthorization(prepared);
    state.balance = 0n;
    expect(
      await submitPurchase(20, { purchaseId: (prepared as any).purchaseId, signature }, NOW, 0)
    ).toMatchObject({ refused: true, reason: "insufficient_balance", shortBy: "3000000" });
    expect(relayerCall).not.toHaveBeenCalled();
  });
});

async function submitted() {
  const prepared = await prepare();
  const signature = await signAuthorization(prepared);
  await submitPurchase(20, { purchaseId: (prepared as any).purchaseId, signature }, NOW, 0);
  return state.purchases[0]!;
}

describe("store policy on the purchase (CK-5)", () => {
  const version = (n: number) => ({
    id: Buffer.alloc(16, n),
    version: n,
    mode: "standard",
    settings: { sellerName: "Maya Lin" },
  });

  it("carries the version the intent showed to the purchase", async () => {
    state.live = version(2);
    state.intents[0]!.storePolicyVersionId = Buffer.alloc(16, 2);
    const result = await prepare();
    expect(result.refused).toBe(false);
    expect(state.purchases[0]!.storePolicyVersionId).toEqual(Buffer.alloc(16, 2));
  });

  it("refuses a newer live policy until the fan accepts that version", async () => {
    state.live = version(3);
    state.intents[0]!.storePolicyVersionId = Buffer.alloc(16, 2);
    expect(await prepare()).toEqual({ refused: true, reason: "policy_changed", policyVersion: 3 });
    expect(state.purchases).toHaveLength(0);
    // Accepting an older version still refuses
    expect(await prepare({ policyVersion: 2 })).toMatchObject({ reason: "policy_changed" });
    const accepted = await prepare({ policyVersion: 3 });
    expect(accepted.refused).toBe(false);
    expect(state.intents[0]!.storePolicyVersionId).toEqual(Buffer.alloc(16, 3));
    expect(state.purchases[0]!.storePolicyVersionId).toEqual(Buffer.alloc(16, 3));
  });

  it("stores the live version when the intent has none yet", async () => {
    state.live = version(4);
    expect((await prepare()).refused).toBe(false);
    expect(state.intents[0]!.storePolicyVersionId).toEqual(Buffer.alloc(16, 4));
  });
});

describe("purchaseForIntent (CK-5 Checking)", () => {
  it("is null before anything is sent, then reports the sent purchase", async () => {
    await prepare();
    expect(await purchaseForIntent(20, INTENT)).toBeNull();
    state.purchases = [];
    const row = await submitted();
    state.receipt = receiptFor(row);
    expect(await purchaseForIntent(20, INTENT)).toMatchObject({
      status: "confirmed_soft",
      unlocked: true,
    });
    // Another fan reads nothing
    expect(await purchaseForIntent(21, INTENT)).toBeNull();
  });
});

describe("settlePurchase", () => {
  it("waits for a receipt, opens at soft, finishes at final with events and one receipt", async () => {
    const row = await submitted();
    expect(row.status).toBe("submitted");

    state.receipt = receiptFor(row);
    state.head = 100n;
    expect(await settlePurchase(row.id, { now: NOW })).toBe("confirmed_soft");
    expect(state.events).toHaveLength(0);

    // The block holding it counts as the first confirmation: 12 at head 111
    state.head = 110n;
    expect(await settlePurchase(row.id, { now: NOW })).toBe("confirmed_soft");
    state.head = 111n;
    expect(await settlePurchase(row.id, { now: NOW })).toBe("confirmed");
    expect(row.confirmedAt).toEqual(NOW);
    expect(state.events.map(e => [e.kind, e.role ?? null, e.amount])).toEqual([
      ["purchase_paid", null, 3_000_000n],
      ["purchase_share", 1, 150_000n],
      ["purchase_share", 0, 2_850_000n],
    ]);
    expect(state.events[0]).toMatchObject({
      refType: "purchase",
      payerUserId: 20,
      payeeUserId: 10,
    });
    expect(deliverEmail).toHaveBeenCalledTimes(1);
    expect((deliverEmail.mock.calls[0]![0] as any).subject).toBe("Your receipt for Episode 4");
    expect(row.receiptSentAt).toBeInstanceOf(Date);

    // Settling again changes nothing and sends nothing
    expect(await settlePurchase(row.id, { now: NOW })).toBe("confirmed");
    expect(deliverEmail).toHaveBeenCalledTimes(1);
  });

  it("a reorg after soft confirm closes access until it lands again", async () => {
    const row = await submitted();
    state.receipt = receiptFor(row);
    await settlePurchase(row.id, { now: NOW });
    expect(row.status).toBe("confirmed_soft");
    state.receipt = null;
    expect(await settlePurchase(row.id, { now: NOW })).toBe("submitted");
    expect(state.intents[0]!.status).toBe("submitted");
    expect(await purchasedTargets(20, "content", ["abc123"], NOW)).toEqual(new Set());
    state.receipt = receiptFor(row, "success", 105n);
    state.head = 105n;
    expect(await settlePurchase(row.id, { now: NOW })).toBe("confirmed_soft");
  });

  it("a product with an access period ends N days after the first confirmation (G4)", async () => {
    const row = await submitted();
    row.offerId = Buffer.alloc(16, 7);
    state.offerPeriodDays = 30;
    state.receipt = receiptFor(row);
    state.head = 100n;
    expect(await settlePurchase(row.id, { now: NOW })).toBe("confirmed_soft");
    const end = new Date(NOW.getTime() + 30 * 86_400_000);
    expect(row.accessUntil).toEqual(end);
    // Final keeps the end the soft confirmation set
    state.head = 111n;
    expect(await settlePurchase(row.id, { now: new Date(NOW.getTime() + 60_000) })).toBe(
      "confirmed"
    );
    expect(row.accessUntil).toEqual(end);
  });

  it("a reorg clears a product's access end, so it restarts when the payment lands again", async () => {
    const row = await submitted();
    row.offerId = Buffer.alloc(16, 7);
    state.offerPeriodDays = 7;
    state.receipt = receiptFor(row);
    await settlePurchase(row.id, { now: NOW });
    expect(row.accessUntil).toBeInstanceOf(Date);
    state.receipt = null;
    expect(await settlePurchase(row.id, { now: NOW })).toBe("submitted");
    expect(row.accessUntil).toBeNull();
  });

  it("lifetime products and content leave accessUntil empty", async () => {
    const row = await submitted();
    state.receipt = receiptFor(row);
    await settlePurchase(row.id, { now: NOW });
    expect(row.accessUntil).toBeNull();
  });

  it("a reverted receipt fails it, and a long silence marks it dropped", async () => {
    const row = await submitted();
    state.receipt = receiptFor(row, "reverted");
    expect(await settlePurchase(row.id, { now: NOW })).toBe("failed");
    expect(row.failureCode).toBe("reverted");
    expect(row.gasCostWei).toBe(90_000n * 1_000_000n);

    state.purchases = [];
    state.intents[0]!.status = "open";
    state.receipt = null;
    const second = await submitted();
    state.receipt = null;
    expect(await settlePurchase(second.id, { now: NOW })).toBe("submitted");
    const later = new Date(Date.now() + 31 * 60 * 1000);
    expect(await settlePurchase(second.id, { now: later })).toBe("failed");
    expect(second.failureCode).toBe("dropped");
    expect(state.intents[0]!.status).toBe("open");
  });

  it("is not marked dropped while the fan's authorization can still land", async () => {
    settings.quoteWindowSeconds = 3600;
    const row = await submitted();
    state.receipt = null;
    const at31 = new Date(NOW.getTime() + 31 * 60 * 1000);
    row.updatedAt = NOW;
    expect(await settlePurchase(row.id, { now: at31 })).toBe("submitted");
    expect(state.intents[0]!.status).toBe("submitted");
    const pastValidity = new Date(NOW.getTime() + 61 * 60 * 1000);
    expect(await settlePurchase(row.id, { now: pastValidity })).toBe("failed");
    expect(row.failureCode).toBe("dropped");
  });

  it("the worker settles in flight rows and expires stale prepared ones", async () => {
    const row = await submitted();
    state.receipt = receiptFor(row);
    state.head = 120n;
    state.purchases.push({
      id: hexToPurchaseId("04".repeat(16)),
      status: "prepared",
      createdAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000),
      updatedAt: NOW,
    });
    await settlePendingOnce(NOW);
    expect(row.status).toBe("confirmed");
    expect(state.purchases[1]!.status).toBe("expired");
  });

  it("status reports unlocked and final", async () => {
    const row = await submitted();
    const id = Buffer.from(row.id).toString("hex");
    expect(await purchaseStatus(20, id)).toMatchObject({ status: "submitted", unlocked: false });
    state.receipt = receiptFor(row);
    expect(await purchaseStatus(20, id)).toMatchObject({
      status: "confirmed_soft",
      unlocked: true,
      final: false,
      txUrl: `https://sepolia.basescan.org/tx/0x${"ab".repeat(32)}`,
    });
  });
});

describe("payment log indexer", () => {
  it("reads at final depth from the cursor", () => {
    expect(nextPaymentsRange(null, 100n, 12n)).toEqual({ from: 0n, to: 89n });
    expect(nextPaymentsRange(80n, 100n, 12n)).toEqual({ from: 81n, to: 89n });
    expect(nextPaymentsRange(89n, 100n, 12n)).toBeNull();
    expect(nextPaymentsRange(null, 10_000n, 12n)).toEqual({ from: 4_989n, to: 6_988n });
  });

  it("finishes a purchase whose submit response was lost, and stores each log once", async () => {
    const prepared = await prepare();
    const row = state.purchases[0]!;
    row.status = "submitting";
    state.receipt = receiptFor(row);
    state.logs = paidLogs(row);
    state.head = 120n;
    await indexPaymentLogsOnce(NOW);
    expect(row.status).toBe("confirmed");
    expect(row.txHash).toBe("0x" + "ab".repeat(32));
    expect(state.events).toHaveLength(3);
    expect((prepared as any).purchaseId).toBe(Buffer.from(row.id).toString("hex"));
    // The cursor moved; a rerun of the same range stores nothing new
    state.settings.clear();
    expect(await indexPaymentLogsOnce(NOW)).toBe(0);
  });

  it("skips a log for a purchase another database minted and still moves the cursor", async () => {
    const stranger = { ...(await submitted()) };
    state.purchases = [];
    state.logs = paidLogs(stranger);
    state.head = 120n;
    await indexPaymentLogsOnce(NOW);
    expect(state.settings.get("ampedpay_payments_cursor_84532")?.setting_value).toBe("109");
  });

  it("a Paid log opens a purchase even after it was marked expired", async () => {
    await prepare();
    const row = state.purchases[0]!;
    row.status = "expired";
    state.receipt = receiptFor(row);
    state.logs = paidLogs(row);
    state.head = 120n;
    await indexPaymentLogsOnce(NOW);
    expect(row.status).toBe("confirmed");
  });

  it("a Refunded log closes access", async () => {
    const row = await submitted();
    state.receipt = receiptFor(row);
    state.head = 120n;
    await settlePurchase(row.id, { now: NOW });
    const ref = purchasePaymentRef(row.id);
    state.logs = [
      {
        address: CONTRACT,
        blockHash: "0x" + "22".repeat(32),
        blockNumber: 105n,
        transactionHash: "0x" + "cd".repeat(32),
        transactionIndex: 0,
        logIndex: 4,
        removed: false,
        topics: encodeEventTopics({
          abi: AMPEDPAY_ABI,
          eventName: "Refunded",
          args: { paymentRef: ref, payer: row.payer, creator: row.creatorAddress },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [row.amount]),
      },
    ];
    await indexPaymentLogsOnce(NOW);
    expect(row.status).toBe("refunded");
    expect(await purchasedTargets(20, "content", ["abc123"], NOW)).toEqual(new Set());
    expect(state.events.at(-1)).toMatchObject({
      kind: "purchase_refunded",
      payerUserId: 10,
      payeeUserId: 20,
    });
  });
});
