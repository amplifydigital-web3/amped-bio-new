/**
 * PAY-A2 AmpedPay on chain admin (Build Board #50), spec docs/features/ampedpay.md 3.2, 3.5,
 * 3.6 and acceptance 3, 5, 6 and 7: contract ranges and the server bounds that depend on
 * them, the Safe transaction and its hash, delegate proposals and the manual fallback,
 * Superseded, the admin event indexer, and pause through the pauser account. The database,
 * the chain, the Safe service and Coinbase are faked in memory.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  concat,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  keccak256,
  pad,
  parseEventLogs,
  recoverTypedDataAddress,
  stringToHex,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AMPEDPAY_ABI, AMPEDPAY_ROLES, SAFE_TX_TYPES, ampedPayParamName } from "@repo/web3";
import { JOHN, PLAIN, ROB, resetPaymentsFakes, store } from "./payments-fakes";

vi.mock("@repo/database", async () => ({
  prisma: (await import("./payments-fakes")).db,
  Prisma: {},
}));
vi.mock("../utils/auth", async () => ({
  auth: { api: { verifyTOTP: (await import("./payments-fakes")).verifyTOTP } },
}));
vi.mock("../services/usdc/admin", () => ({
  relayerState: vi.fn(async () => ({ configured: false })),
}));

import { env } from "../env";
import { clearPaymentSettingsCache } from "../services/payments/settings";
import {
  approveChange,
  changeSafeDetails,
  draftChange,
  pauseContract,
  rejectChange,
  settingsView,
} from "../services/payments/changes";
import { encodeContractCall, validateContractValue } from "../services/payments/contractChanges";
import {
  setPaymentsChainForTests,
  type ContractState,
  type PaymentsChain,
} from "../services/payments/onchain";
import { setPaymentsCdpForTests } from "../services/payments/accounts";
import {
  buildSafeTx,
  safeTxHash,
  setSafeServiceForTests,
  type SafeService,
  type SafeTx,
} from "../services/payments/safe";
import { setPauserSenderForTests } from "../services/payments/pauser";
import {
  adminEventsFromLogs,
  recordAdminEvent,
  supersedeStaleProposals,
} from "../services/payments/indexer";
import { clearTwoFactorFailuresForTests } from "../services/payments/twoFactor";
import { paymentsAdminRouter } from "../trpc/admin/payments";

const CONTRACT = getAddress("0x7777777777777777777777777777777777777777");
const SAFE = getAddress("0x5555555555555555555555555555555555555555");
const RELAYER = getAddress("0x1111111111111111111111111111111111111111");
const NEW_RELAYER = getAddress("0x2222222222222222222222222222222222222222");
const SIGNER = getAddress("0x3333333333333333333333333333333333333333");
const PROPOSER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const proposer = privateKeyToAccount(PROPOSER_KEY);
const NOW = new Date("2026-10-28T15:00:00Z");
const CHAIN_ID = 84532;

function caller(sub: number, role: string) {
  return paymentsAdminRouter.createCaller({
    req: { headers: {} } as never,
    res: {} as never,
    user: { sub, email: `${sub}@amped.bio`, role, wallet: null, poolAddresses: {} },
  });
}
const john = () => caller(JOHN, "admin,payments_admin");
const plain = () => caller(PLAIN, "admin");

/* ------------------------------------------------------------------ fake chain */

let state: ContractState;
let safeNonce: number;
let relayerRole: Set<string>;
let chainUp: boolean;

const chain: PaymentsChain = {
  async contract() {
    if (!chainUp) throw new Error("RPC down");
    return { ...state, readAt: new Date() };
  },
  async safe(address) {
    if (!chainUp) throw new Error("RPC down");
    return {
      address,
      owners: [
        getAddress("0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"),
        getAddress("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"),
      ],
      threshold: 1,
      nonce: safeNonce,
      version: "1.4.1",
      readAt: new Date(),
    };
  },
  async hasRole(_contract, role, account) {
    return role === AMPEDPAY_ROLES.RELAYER_ROLE && relayerRole.has(getAddress(account));
  },
};

/* ------------------------------------------------------------- fake Safe service */

const proposals: { safe: Address; tx: SafeTx; safeTxHash: Hex; sender: Address; signature: Hex }[] =
  [];
let queuedNonces: number[];
let serviceTx: Awaited<ReturnType<SafeService["transaction"]>>;
let proposeFails: boolean;

const service: SafeService = {
  async pendingNonces() {
    return queuedNonces;
  },
  async propose(input) {
    if (proposeFails) throw new Error("service down");
    proposals.push(input);
  },
  async transaction() {
    return serviceTx;
  },
};

/** Coinbase signs typed data with the proposer key, as the CDP endpoint does. */
const cdp = {
  async getEvmAccountByName() {
    return { address: proposer.address };
  },
  async signEvmTypedData(_address: string, body: Record<string, any>) {
    const types = { ...body.types };
    delete types.EIP712Domain;
    const message = Object.fromEntries(
      Object.entries(body.message).map(([key, value]) => [
        key,
        ["value", "safeTxGas", "baseGas", "gasPrice", "nonce"].includes(key)
          ? BigInt(value as string)
          : value,
      ])
    );
    const signature = await proposer.signTypedData({
      domain: body.domain,
      types,
      primaryType: body.primaryType,
      message,
    } as never);
    return { signature };
  },
};

const pauserCalls: { to: Address; data: Hex }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  resetPaymentsFakes();
  clearPaymentSettingsCache();
  clearTwoFactorFailuresForTests();
  proposals.length = 0;
  pauserCalls.length = 0;
  queuedNonces = [];
  serviceTx = null;
  proposeFails = false;
  chainUp = true;
  safeNonce = 4;
  relayerRole = new Set([RELAYER]);
  state = {
    address: CONTRACT,
    paused: false,
    feeFloorBps: 500,
    minCreatorBps: 5_000,
    maxRecipients: 6,
    maxSplitValidity: 3_600,
    minPayment: 500_000n,
    maxPayment: 1_000_000_000n,
    treasury: SAFE,
    splitSigner: SIGNER,
    implementation: getAddress("0x4444444444444444444444444444444444444444"),
    proxyAdmin: getAddress("0x6666666666666666666666666666666666666666"),
    proxyAdminOwner: SAFE,
    safeRoles: { admin: true, params: true, pauser: true },
    readAt: new Date(),
  };
  setPaymentsChainForTests(chain);
  setSafeServiceForTests(service);
  setPaymentsCdpForTests(cdp as never);
  setPauserSenderForTests(async call => {
    pauserCalls.push({ to: call.to, data: call.data });
    return "0xpausepausepausepausepausepausepausepausepausepausepausepausepause" as Hex;
  });
  Object.assign(env, {
    PAYMENTS_ENABLED: false,
    PAYMENT_CHAIN: "base-sepolia",
    AMPEDPAY_ADDRESS: CONTRACT,
    AMPEDPAY_SAFE: SAFE,
    CDP_API_KEY_ID: "key",
    CDP_API_KEY_SECRET: "secret",
    CDP_WALLET_SECRET: "wallet",
    CDP_RELAYER_ACCOUNT: "",
    CDP_SAFE_PROPOSER_ACCOUNT: "amped-safe-proposer",
    CDP_PAUSER_ACCOUNT: "amped-pauser",
    SAFE_API_KEY: "safe-key",
    SAFE_TX_SERVICE_URL: "",
  });
});

/* ---------------------------------------------------------------------- tests */

describe("contract encoding (spec 3.2)", () => {
  it("names params and roles the way the contract does", () => {
    expect(ampedPayParamName("feeFloorBps")).toBe(
      pad(stringToHex("feeFloorBps"), { dir: "right", size: 32 })
    );
    expect(AMPEDPAY_ROLES.RELAYER_ROLE).toBe(keccak256(stringToHex("RELAYER_ROLE")));
    expect(AMPEDPAY_ROLES.DEFAULT_ADMIN_ROLE).toBe(toHex(0, { size: 32 }));
  });

  it("encodes every on chain change as one AmpedPay call", () => {
    const cases: [string, string, string, unknown[]][] = [
      ["feeFloorBps", "450", "setFeeFloorBps", [450]],
      ["minCreatorBps", "6000", "setMinCreatorBps", [6000]],
      ["maxRecipients", "4", "setMaxRecipients", [4]],
      ["maxSplitValidity", "1800", "setMaxSplitValidity", [1800]],
      ["minPayment", "1000000", "setMinPayment", [1_000_000n]],
      ["maxPayment", "2000000000", "setMaxPayment", [2_000_000_000n]],
      ["treasury", NEW_RELAYER, "setTreasury", [NEW_RELAYER]],
      ["splitSigner", NEW_RELAYER, "setSplitSigner", [NEW_RELAYER]],
      ["relayers", `add:${NEW_RELAYER}`, "grantRole", [AMPEDPAY_ROLES.RELAYER_ROLE, NEW_RELAYER]],
      ["relayers", `remove:${RELAYER}`, "revokeRole", [AMPEDPAY_ROLES.RELAYER_ROLE, RELAYER]],
      ["contract_paused", "false", "unpause", []],
    ];
    for (const [item, value, functionName, args] of cases) {
      const call = encodeContractCall(CONTRACT, item, value);
      expect(call.to).toBe(CONTRACT);
      const decoded = decodeFunctionData({ abi: AMPEDPAY_ABI, data: call.data });
      expect(decoded.functionName).toBe(functionName);
      expect(decoded.args ?? []).toEqual(args);
    }
  });
});

describe("contract ranges and dependent server bounds (spec 3.2, 3.6 step 1, acceptance 3)", () => {
  const context = (overrides: Record<string, string> = {}) => ({
    state,
    limits: {
      source: "chain" as const,
      feeFloorBps: state.feeFloorBps,
      minCreatorBps: state.minCreatorBps,
      maxRecipients: state.maxRecipients,
      maxSplitValidity: state.maxSplitValidity,
      minPayment: state.minPayment,
      maxPayment: state.maxPayment,
    },
    relayers: [RELAYER],
    serverValues: {
      platform_fee_bps: "500",
      promoter_share: "100,3000",
      quote_window_seconds: "600",
      one_time_price: "500000,1000000000",
      purchase_usdc_per_day_per_account: "2000000000",
      ...overrides,
    },
  });

  it("keeps the fee floor at or below the platform fee and the 10% ceiling", () => {
    expect(validateContractValue("feeFloorBps", "450", context())).toBe("450");
    expect(() => validateContractValue("feeFloorBps", "600", context())).toThrow(
      /Raise the platform fee first/
    );
    expect(() => validateContractValue("feeFloorBps", "1001", context())).toThrow(/10.00%/);
  });

  it("keeps the creator minimum inside 50% to 100% and above fee plus promoter", () => {
    expect(() => validateContractValue("minCreatorBps", "4999", context())).toThrow(/50.00%/);
    expect(() => validateContractValue("minCreatorBps", "7000", context())).toThrow(
      /creator below/
    );
    expect(validateContractValue("minCreatorBps", "6000", context())).toBe("6000");
  });

  it("checks recipients, split limit and payment limits against the server values", () => {
    expect(() => validateContractValue("maxRecipients", "9", context())).toThrow(/2 and 8/);
    expect(() => validateContractValue("maxSplitValidity", "300", context())).toThrow(
      /quote window/
    );
    expect(() => validateContractValue("minPayment", "9999", context())).toThrow(/0.01 USDC/);
    expect(() => validateContractValue("minPayment", "600000", context())).toThrow(/price minimum/);
    expect(() => validateContractValue("maxPayment", "900000000", context())).toThrow(
      /price maximum/
    );
    expect(() => validateContractValue("maxPayment", "100000000001", context())).toThrow(
      /100,000.00/
    );
  });

  it("adds and removes one relayer at a time and never the last one", () => {
    expect(validateContractValue("relayers", `add:${NEW_RELAYER.toLowerCase()}`, context())).toBe(
      `add:${NEW_RELAYER}`
    );
    expect(() => validateContractValue("relayers", `add:${RELAYER}`, context())).toThrow(/already/);
    expect(() => validateContractValue("relayers", `remove:${RELAYER}`, context())).toThrow(
      /only relayer/
    );
    expect(() => validateContractValue("treasury", zeroAddress, context())).toThrow(/zero/);
  });
});

describe("Safe transaction (spec 3.6 step 3)", () => {
  it("hashes the SafeTx the way the Safe contract does", () => {
    const tx = buildSafeTx(encodeContractCall(CONTRACT, "feeFloorBps", "450"), 7);
    const SAFE_TX_TYPEHASH = keccak256(
      stringToHex(
        "SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)"
      )
    );
    const DOMAIN_TYPEHASH = keccak256(
      stringToHex("EIP712Domain(uint256 chainId,address verifyingContract)")
    );
    // The constants hard coded in Safe.sol v1.3 and later
    expect(SAFE_TX_TYPEHASH).toBe(
      "0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8"
    );
    expect(DOMAIN_TYPEHASH).toBe(
      "0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218"
    );
    const domainSeparator = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }],
        [DOMAIN_TYPEHASH, BigInt(CHAIN_ID), SAFE]
      )
    );
    const structHash = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "address" },
          { type: "uint256" },
          { type: "bytes32" },
          { type: "uint8" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "address" },
          { type: "address" },
          { type: "uint256" },
        ],
        [
          SAFE_TX_TYPEHASH,
          tx.to,
          0n,
          keccak256(tx.data),
          0,
          0n,
          0n,
          0n,
          zeroAddress,
          zeroAddress,
          7n,
        ]
      )
    );
    const expected = keccak256(concat(["0x1901", domainSeparator, structHash]));
    expect(safeTxHash(CHAIN_ID, SAFE, tx)).toBe(expected);
    expect(SAFE_TX_TYPES.SafeTx).toHaveLength(10);
  });
});

async function draftFloor(value = "450") {
  return draftChange({
    userId: JOHN,
    itemId: "feeFloorBps",
    newValue: value,
    reason: "Match the launch promo fee",
    now: NOW,
  });
}

describe("draft and approve an on chain change (spec 3.5, 3.6, acceptance 5)", () => {
  it("drafts from the live value and refuses while the chain is down", async () => {
    const draft = await draftFloor();
    expect(draft).toMatchObject({
      target: "contract",
      key: "feeFloorBps",
      oldValue: "500",
      newValue: "450",
      status: "draft",
    });
    chainUp = false;
    await expect(
      draftChange({
        userId: JOHN,
        itemId: "maxRecipients",
        newValue: "4",
        reason: "Fewer partners",
        now: NOW,
      })
    ).rejects.toThrow(/did not answer/);
  });

  it("refuses an effective date on an on chain value", async () => {
    await expect(
      draftChange({
        userId: JOHN,
        itemId: "feeFloorBps",
        newValue: "450",
        reason: "Lower floor",
        effectiveAt: new Date(NOW.getTime() + 86_400_000),
        now: NOW,
      })
    ).rejects.toThrow(/take no date/);
  });

  it("refuses the drafter, then proposes to the Safe as a delegate after a second admin", async () => {
    const draft = await draftFloor();
    await expect(approveChange({ userId: JOHN, changeId: draft.id, now: NOW })).rejects.toThrow(
      /different payments admin/
    );
    queuedNonces = [4, 5];
    const result = await approveChange({ userId: ROB, changeId: draft.id, now: NOW });
    expect(result).toMatchObject({ status: "proposed", mode: "service" });

    expect(proposals).toHaveLength(1);
    const proposal = proposals[0]!;
    expect(proposal.safe).toBe(SAFE);
    expect(proposal.tx.nonce).toBe(6);
    expect(proposal.tx.to).toBe(CONTRACT);
    expect(proposal.tx.value).toBe("0");
    expect(proposal.safeTxHash).toBe(safeTxHash(CHAIN_ID, SAFE, proposal.tx));
    expect(proposal.sender).toBe(proposer.address);
    const signer = await recoverTypedDataAddress({
      domain: { chainId: CHAIN_ID, verifyingContract: SAFE },
      types: SAFE_TX_TYPES,
      primaryType: "SafeTx",
      message: {
        ...proposal.tx,
        value: 0n,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        nonce: BigInt(proposal.tx.nonce),
      },
      signature: proposal.signature,
    });
    expect(signer).toBe(proposer.address);

    const row = store.changes[0]!;
    expect(row).toMatchObject({
      status: "proposed",
      approvedById: ROB,
      safeTxHash: proposal.safeTxHash,
      chainId: CHAIN_ID,
    });
    // Nothing changes on chain until owners execute (acceptance 5)
    expect(state.feeFloorBps).toBe(500);
  });

  it("falls back to an owner submitted transaction without a Safe API key (spec 6.1)", async () => {
    env.SAFE_API_KEY = "";
    const draft = await draftFloor();
    const result = await approveChange({ userId: ROB, changeId: draft.id, now: NOW });
    expect(result).toMatchObject({ status: "proposed", mode: "manual" });
    expect(proposals).toHaveLength(0);
    const details = await changeSafeDetails(draft.id, NOW);
    expect(details).toMatchObject({
      mode: "manual",
      safe: SAFE,
      // The owner's own transaction gets the next nonce and its own hash
      nonce: null,
      safeTxHash: null,
      to: CONTRACT,
      method: "setFeeFloorBps(450)",
    });
    expect(details!.data).toBe(encodeContractCall(CONTRACT, "feeFloorBps", "450").data);
    expect(details!.safeUrl).toContain(`basesep:${SAFE}`);
  });

  it("returns the draft for another try when the proposal fails", async () => {
    const draft = await draftFloor();
    proposeFails = true;
    await expect(approveChange({ userId: ROB, changeId: draft.id, now: NOW })).rejects.toThrow(
      /Nothing was changed/
    );
    expect(store.changes[0]).toMatchObject({ status: "draft", approvedById: null });
  });

  it("supersedes the draft when the value moved on chain", async () => {
    const draft = await draftFloor();
    state.feeFloorBps = 400;
    await expect(approveChange({ userId: ROB, changeId: draft.id, now: NOW })).rejects.toThrow(
      /changed on chain/
    );
    expect(store.changes[0]!.status).toBe("superseded");
  });

  it("lets a payments admin close a proposed change", async () => {
    const draft = await draftFloor();
    await approveChange({ userId: ROB, changeId: draft.id, now: NOW });
    await rejectChange({ userId: JOHN, changeId: draft.id, note: "Owners rejected it", now: NOW });
    expect(store.changes[0]!.status).toBe("rejected");
  });

  it("drafts and proposes a resume as unpause through the Safe", async () => {
    state.paused = true;
    const draft = await draftChange({
      userId: JOHN,
      itemId: "contract_paused",
      newValue: "false",
      reason: "Incident closed",
      now: NOW,
    });
    await approveChange({ userId: ROB, changeId: draft.id, now: NOW });
    const decoded = decodeFunctionData({ abi: AMPEDPAY_ABI, data: proposals[0]!.tx.data });
    expect(decoded.functionName).toBe("unpause");
    await expect(
      draftChange({
        userId: JOHN,
        itemId: "contract_paused",
        newValue: "true",
        reason: "Pause",
        now: NOW,
      })
    ).rejects.toThrow(/Only Resume is drafted/);
  });
});

describe("pause the contract (spec 3.5 exception, decision 2, acceptance 6)", () => {
  it("sends pause() through the pauser and logs it with the transaction", async () => {
    const result = await john().pauseContract({ reason: "Suspicious split", code: "123456" });
    expect(result).toMatchObject({ paused: true });
    expect(pauserCalls).toHaveLength(1);
    expect(decodeFunctionData({ abi: AMPEDPAY_ABI, data: pauserCalls[0]!.data }).functionName).toBe(
      "pause"
    );
    expect(store.changes[0]).toMatchObject({
      key: "contract_paused",
      target: "contract",
      newValue: "true",
      status: "applied",
      draftedById: JOHN,
      approvedById: null,
    });
  });

  it("refuses a plain admin, a wrong code and a contract already paused", async () => {
    await expect(plain().pauseContract({ reason: "Test", code: "123456" })).rejects.toThrow(
      /payments admin/
    );
    await expect(john().pauseContract({ reason: "Test", code: "000000" })).rejects.toThrow();
    state.paused = true;
    await expect(john().pauseContract({ reason: "Test", code: "123456" })).rejects.toThrow(
      /already paused/
    );
    expect(pauserCalls).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------- indexer */

function rawLog(eventName: string, args: Record<string, unknown>, txHash: Hex, logIndex = 0): Log {
  const event = AMPEDPAY_ABI.find(item => item.type === "event" && item.name === eventName)!;
  const topics = encodeEventTopics({ abi: [event], eventName, args } as never);
  const dataInputs = (
    event as { inputs: { name: string; type: string; indexed?: boolean }[] }
  ).inputs.filter(input => !input.indexed);
  const data = dataInputs.length
    ? encodeAbiParameters(dataInputs, dataInputs.map(input => args[input.name]) as never)
    : "0x";
  return {
    address: CONTRACT,
    topics: topics as [Hex, ...Hex[]],
    data,
    blockNumber: 100n,
    blockHash: "0x" + "ab".repeat(32),
    logIndex,
    transactionHash: txHash,
    transactionIndex: 0,
    removed: false,
  } as Log;
}

const TX = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;

describe("admin event indexer (spec 3.6 step 5, acceptance 7)", () => {
  it("decodes ParamChanged, pause and relayer role events into catalog changes", () => {
    const logs = parseEventLogs({
      abi: AMPEDPAY_ABI,
      logs: [
        rawLog(
          "ParamChanged",
          { name: ampedPayParamName("feeFloorBps"), oldValue: 500n, newValue: 450n },
          TX(1)
        ),
        rawLog(
          "ParamChanged",
          {
            name: ampedPayParamName("treasury"),
            oldValue: BigInt(SAFE),
            newValue: BigInt(NEW_RELAYER),
          },
          TX(2),
          1
        ),
        rawLog("Paused", { account: SAFE }, TX(3), 2),
        rawLog(
          "RoleGranted",
          { role: AMPEDPAY_ROLES.RELAYER_ROLE, account: NEW_RELAYER, sender: SAFE },
          TX(4),
          3
        ),
        rawLog(
          "RoleGranted",
          { role: AMPEDPAY_ROLES.PARAMS_ROLE, account: NEW_RELAYER, sender: SAFE },
          TX(5),
          4
        ),
      ],
    });
    expect(adminEventsFromLogs(logs as never).map(e => [e.key, e.oldValue, e.newValue])).toEqual([
      ["feeFloorBps", "500", "450"],
      ["treasury", SAFE, NEW_RELAYER],
      ["contract_paused", "false", "true"],
      ["relayers", null, `add:${NEW_RELAYER}`],
    ]);
  });

  it("marks the proposed change applied with the transaction hash", async () => {
    const draft = await draftFloor();
    await approveChange({ userId: ROB, changeId: draft.id, now: NOW });
    const at = new Date(NOW.getTime() + 60_000);
    const changed = await recordAdminEvent(
      {
        key: "feeFloorBps",
        oldValue: "500",
        newValue: "450",
        txHash: TX(9),
        blockNumber: 1n,
        logIndex: 0,
      },
      at
    );
    expect(changed).toBe(true);
    expect(store.changes).toHaveLength(1);
    expect(store.changes[0]).toMatchObject({ status: "applied", txHash: TX(9), appliedAt: at });
    // A second read of the same log changes nothing
    expect(
      await recordAdminEvent(
        {
          key: "feeFloorBps",
          oldValue: "500",
          newValue: "450",
          txHash: TX(9),
          blockNumber: 1n,
          logIndex: 0,
        },
        at
      )
    ).toBe(false);
  });

  it("logs a change made in the Safe directly, and skips the pause the portal sent", async () => {
    await recordAdminEvent(
      {
        key: "maxRecipients",
        oldValue: "6",
        newValue: "5",
        txHash: TX(10),
        blockNumber: 1n,
        logIndex: 0,
      },
      NOW
    );
    expect(store.changes[0]).toMatchObject({
      key: "maxRecipients",
      status: "applied",
      draftedById: 0,
      txHash: TX(10),
    });
    const { txHash } = await pauseContract({ userId: JOHN, reason: "Incident", now: NOW });
    expect(
      await recordAdminEvent(
        {
          key: "contract_paused",
          oldValue: "false",
          newValue: "true",
          txHash: txHash as Hex,
          blockNumber: 2n,
          logIndex: 0,
        },
        NOW
      )
    ).toBe(false);
    expect(store.changes).toHaveLength(2);
  });

  it("supersedes a proposal the Safe moved past without executing it", async () => {
    const draft = await draftFloor();
    await approveChange({ userId: ROB, changeId: draft.id, now: NOW });
    safeNonce = 5;
    serviceTx = {
      confirmations: 0,
      required: 1,
      executed: false,
      successful: null,
      transactionHash: null,
      nonce: 4,
    };
    expect(await supersedeStaleProposals(NOW)).toBe(1);
    expect(store.changes[0]!.status).toBe("superseded");
  });

  it("keeps a proposal the Safe has not reached yet", async () => {
    const draft = await draftFloor();
    await approveChange({ userId: ROB, changeId: draft.id, now: NOW });
    serviceTx = {
      confirmations: 0,
      required: 1,
      executed: false,
      successful: null,
      transactionHash: null,
      nonce: 4,
    };
    expect(await supersedeStaleProposals(NOW)).toBe(0);
    expect(store.changes[0]!.status).toBe("proposed");
  });

  it("leaves an executed proposal for the event to apply", async () => {
    const draft = await draftFloor();
    await approveChange({ userId: ROB, changeId: draft.id, now: NOW });
    safeNonce = 5;
    serviceTx = {
      confirmations: 1,
      required: 1,
      executed: true,
      successful: true,
      transactionHash: TX(11),
      nonce: 4,
    };
    expect(await supersedeStaleProposals(NOW)).toBe(0);
    expect(store.changes[0]!.status).toBe("proposed");
  });
});

describe("settings read live from the contract (spec 3.8 a2, acceptance 8)", () => {
  it("shows the contract's values, the relayers and the read source", async () => {
    state.feeFloorBps = 400;
    const view = await settingsView(NOW);
    expect(view.contractSource).toBe("chain");
    const byId = Object.fromEntries(view.items.map(item => [item.id, item]));
    expect(byId.feeFloorBps!.value).toBe("400");
    expect(byId.treasury!.value).toBe(SAFE);
    expect(byId.splitSigner!.value).toBe(SIGNER);
    expect(byId.contract_paused!.value).toBe("false");
  });

  it("falls back to the deploy defaults when the chain is down", async () => {
    chainUp = false;
    const view = await settingsView(NOW);
    expect(view.contractSource).toBe("deploy");
    expect(view.contractReadFailed).toBe(true);
  });

  it("lets a plain admin read the Safe details and change nothing", async () => {
    const draft = await draftFloor();
    const id = Buffer.from(draft.id).toString("hex");
    const details = await plain().changes.safe({ id });
    expect(details).toMatchObject({ to: CONTRACT, method: "setFeeFloorBps(450)" });
    await expect(plain().changes.approve({ id, code: "123456" })).rejects.toThrow(/payments admin/);
  });
});
