/**
 * USDC-2 gasless send (Build Board #29), spec docs/features/usdc-wallet-onramp.md
 * 3.4, 3.5 and acceptance 3, 5, 6, 13, 14 and 17. The database, the Base RPC
 * and the CDP relayer are mocked; the EIP-712 signing is real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeFunctionData, getAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { USDC_COPY, USDC_SEND_LIMITS } from "@repo/constants";
import { TRANSFER_WITH_AUTHORIZATION_TYPES, USDC_EIP3009_ABI, parseUsdc } from "@repo/web3";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    siteSettings: { findUnique: fn(), upsert: fn() },
    user: { findUnique: fn(), update: fn() },
    userWallet: { findFirst: fn(), findMany: fn() },
    usdcSend: {
      create: fn(),
      findFirst: fn(),
      findMany: fn(),
      update: fn(),
      updateMany: fn(),
      count: fn(),
      aggregate: fn(),
    },
    paymentEvent: { create: fn(), findMany: fn() },
    onrampSession: { findMany: fn() },
    screeningEvent: { create: fn() },
  };
});

vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));
vi.mock("../utils/rateLimit", () => ({ enforceRateLimits: vi.fn() }));

import { env } from "../env";
import {
  buildTransferAuthorization,
  isSignedBy,
  splitAuthorizationSignature,
  toTypedDataPayload,
} from "../services/usdc/authorization";
import { setPaymentClientForTests, usdcAddress, usdcDomain } from "../services/usdc/chain";
import {
  encodeAuthorizationCall,
  gasState,
  setRelayerForTests,
  type Relayer,
} from "../services/usdc/relayer";
import { startOfUtcDay, withinDailyLimits } from "../services/usdc/limits";
import {
  clearScreeningCacheForTests,
  screenAddress,
  ScreeningUnavailableError,
} from "../services/usdc/screen";
import { abandonUsdcSend, prepareUsdcSend, submitUsdcSend } from "../services/usdc/send";
import { recentSends } from "../services/usdc/admin";
import { nextRange, CONFIRMATIONS, INITIAL_LOOKBACK, MAX_RANGE } from "../services/usdc/indexer";
import { recordUsdcTransfers } from "../services/usdc/events";
import { cdpWalletJwt, sortKeys } from "../services/usdc/cdp";
import { decodeJwt } from "jose";

const fan = privateKeyToAccount(generatePrivateKey());
const friend = getAddress("0x1111111111111111111111111111111111111111");
const sanctioned = getAddress("0x2222222222222222222222222222222222222222");
const NOW = new Date("2026-10-12T15:00:00Z");

const chain = {
  readContract: vi.fn(),
  getBalance: vi.fn(),
  estimateGas: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  getTransactionReceipt: vi.fn(),
  getBlock: vi.fn(),
  getBlockNumber: vi.fn(),
  getLogs: vi.fn(),
};

const relayer = {
  address: vi.fn(async () => getAddress("0x9999999999999999999999999999999999999999")),
  gas: vi.fn(),
  submit: vi.fn(),
} satisfies Relayer;

function readContractDefault({ functionName }: { functionName: string }) {
  if (functionName === "name") return Promise.resolve("USDC");
  if (functionName === "version") return Promise.resolve("2");
  if (functionName === "balanceOf") return Promise.resolve(500_000_000n);
  if (functionName === "isSanctioned") return Promise.resolve(false);
  return Promise.reject(new Error(`unexpected ${functionName}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  clearScreeningCacheForTests();
  setPaymentClientForTests(chain as never);
  setRelayerForTests(relayer);
  chain.readContract.mockImplementation(readContractDefault);
  Object.assign(env, {
    USDC_ENABLED: true,
    CDP_API_KEY_ID: "kid",
    CDP_API_KEY_SECRET: "secret",
    CDP_WALLET_SECRET: "wallet",
    CDP_RELAYER_ACCOUNT: "amped-relayer-staging",
    CIRCLE_API_KEY: "",
    CHAINALYSIS_ORACLE: "",
    USDC_SCREEN_DENYLIST: "",
    USDC_SCREENING_REQUIRED: false,
  });
  db.siteSettings.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue({ email_verified: true, wallet: { address: fan.address } });
  db.usdcSend.count.mockResolvedValue(0);
  db.usdcSend.aggregate.mockResolvedValue({ _sum: { amount: null } });
  db.userWallet.findFirst.mockResolvedValue(null);
  db.usdcSend.create.mockResolvedValue({});
  db.screeningEvent.create.mockResolvedValue({});
});

describe("EIP-3009 typed data", () => {
  it("builds the authorization with a 10 minute window and a 32 byte nonce", () => {
    const auth = buildTransferAuthorization({
      from: fan.address,
      to: friend,
      value: 25_000_000n,
      now: NOW,
      ttlSeconds: USDC_SEND_LIMITS.authorizationTtlSeconds,
    });
    expect(auth.validAfter).toBe(0n);
    expect(auth.validBefore).toBe(BigInt(NOW.getTime() / 1000 + 600));
    expect(auth.nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("reads the domain from the contract and verifies a real signature", async () => {
    const domain = await usdcDomain();
    expect(domain).toMatchObject({ name: "USDC", version: "2", chainId: 84532 });
    const auth = buildTransferAuthorization({
      from: fan.address,
      to: friend,
      value: 1n,
      now: NOW,
      ttlSeconds: 600,
    });
    const signature = await fan.signTypedData({
      domain,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: auth,
    });
    expect(await isSignedBy(domain, auth, signature)).toBe(true);
    expect(await isSignedBy(domain, { ...auth, value: 2n }, signature)).toBe(false);
  });

  it("serializes amounts as strings so the payload survives JSON", async () => {
    const auth = buildTransferAuthorization({
      from: fan.address,
      to: friend,
      value: 25n,
      now: NOW,
      ttlSeconds: 600,
    });
    const payload = toTypedDataPayload(await usdcDomain(), auth);
    expect(JSON.parse(JSON.stringify(payload)).message.value).toBe("25");
  });

  it("encodes transferWithAuthorization with v as 27 or 28", async () => {
    const domain = await usdcDomain();
    const auth = buildTransferAuthorization({
      from: fan.address,
      to: friend,
      value: 7n,
      now: NOW,
      ttlSeconds: 600,
    });
    const signature = await fan.signTypedData({
      domain,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: auth,
    });
    const decoded = decodeFunctionData({
      abi: USDC_EIP3009_ABI,
      data: encodeAuthorizationCall(auth, signature),
    });
    expect(decoded.functionName).toBe("transferWithAuthorization");
    expect(decoded.args?.slice(0, 3)).toEqual([fan.address, friend, 7n]);
    expect([27, 28]).toContain(splitAuthorizationSignature(signature).v);
  });
});

describe("daily limits (decision 7)", () => {
  it("allows the tenth send and refuses the eleventh", () => {
    expect(withinDailyLimits({ count: 9, units: 0n }, 1n)).toBe(true);
    expect(withinDailyLimits({ count: 10, units: 0n }, 1n)).toBe(false);
  });

  it("refuses a send that would pass 2,000 USDC today", () => {
    expect(withinDailyLimits({ count: 1, units: 1_999_000_000n }, 1_000_000n)).toBe(true);
    expect(withinDailyLimits({ count: 1, units: 1_999_000_000n }, 1_000_001n)).toBe(false);
  });

  it("resets at 00:00 UTC", () => {
    expect(startOfUtcDay(NOW).toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });
});

describe("screening (decision 3)", () => {
  it("refuses a denylisted address, records the deny and never caches it", async () => {
    env.USDC_SCREEN_DENYLIST = sanctioned.toLowerCase();
    const first = await screenAddress(sanctioned, "send_destination", 7);
    expect(first).toMatchObject({ allowed: false, deniedBy: "denylist" });
    await screenAddress(sanctioned, "send_destination", 7);
    expect(db.screeningEvent.create).toHaveBeenCalledTimes(2);
  });

  it("asks the oracle and caches an allow for 24 hours", async () => {
    env.CHAINALYSIS_ORACLE = "0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B";
    const now = Date.now();
    await screenAddress(friend, "send_destination", 7, now);
    await screenAddress(friend, "send_destination", 7, now + 60_000);
    const oracleCalls = chain.readContract.mock.calls.filter(
      ([c]) => c.functionName === "isSanctioned"
    );
    expect(oracleCalls).toHaveLength(1);
    await screenAddress(friend, "send_destination", 7, now + 25 * 60 * 60 * 1000);
    expect(
      chain.readContract.mock.calls.filter(([c]) => c.functionName === "isSanctioned")
    ).toHaveLength(2);
  });

  it("refuses an address the oracle lists", async () => {
    env.CHAINALYSIS_ORACLE = "0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B";
    chain.readContract.mockImplementation(args =>
      args.functionName === "isSanctioned" ? Promise.resolve(true) : readContractDefault(args)
    );
    expect(await screenAddress(sanctioned, "send_destination", 7)).toMatchObject({
      allowed: false,
      deniedBy: "chainalysis_oracle",
    });
  });

  it("fails closed when screening is required and no vendor is configured", async () => {
    env.USDC_SCREENING_REQUIRED = true;
    await expect(screenAddress(friend, "send_destination")).rejects.toBeInstanceOf(
      ScreeningUnavailableError
    );
  });

  it("allows as unscreened on staging when no vendor is configured", async () => {
    expect(await screenAddress(friend, "send_destination")).toMatchObject({
      allowed: true,
      unscreened: true,
    });
  });
});

describe("wallet.sendUsdc.prepare", () => {
  const prepare = (to = friend, amount = "25") => prepareUsdcSend(7, { to, amount }, NOW);

  it("returns typed data for a screened send and stores it as screened", async () => {
    const result = await prepare();
    expect(result.refused).toBe(false);
    if (result.refused) return;
    expect(result.typedData.message).toMatchObject({
      from: fan.address,
      to: friend,
      value: "25000000",
    });
    expect(result.typedData.domain.verifyingContract).toBe(usdcAddress());
    expect(db.usdcSend.create.mock.calls[0][0].data).toMatchObject({
      status: "screened",
      amount: 25_000_000n,
    });
  });

  it("is paused by the admin switch (acceptance 14)", async () => {
    db.siteSettings.findUnique.mockResolvedValue({ setting_value: "true" });
    expect(await prepare()).toEqual({ refused: true, reason: "paused" });
  });

  it("is paused while the relayer is not configured", async () => {
    env.CDP_RELAYER_ACCOUNT = "";
    expect(await prepare()).toEqual({ refused: true, reason: "paused" });
  });

  it("requires a verified email", async () => {
    db.user.findUnique.mockResolvedValue({
      email_verified: false,
      wallet: { address: fan.address },
    });
    expect(await prepare()).toEqual({ refused: true, reason: "email_unverified" });
  });

  it("refuses a send to yourself or to the USDC contract", async () => {
    expect(await prepare(fan.address)).toEqual({ refused: true, reason: "invalid_recipient" });
    expect(await prepare(usdcAddress())).toEqual({ refused: true, reason: "invalid_recipient" });
  });

  it("refuses the eleventh send of the day and records it (acceptance 6)", async () => {
    db.usdcSend.count.mockResolvedValue(10);
    expect(await prepare()).toEqual({ refused: true, reason: "limit" });
    expect(db.usdcSend.create.mock.calls[0][0].data).toMatchObject({
      status: "refused",
      failureCode: "limit",
    });
  });

  it("refuses more than the balance", async () => {
    expect(await prepare(friend, "501")).toEqual({ refused: true, reason: "insufficient_balance" });
  });

  it("refuses a sanctioned destination before anything is signed (acceptance 5)", async () => {
    env.USDC_SCREEN_DENYLIST = sanctioned;
    expect(await prepare(sanctioned)).toEqual({ refused: true, reason: "screening" });
    expect(db.usdcSend.create.mock.calls[0][0].data).toMatchObject({
      status: "refused",
      failureCode: "screening",
    });
    expect(db.screeningEvent.create).toHaveBeenCalled();
  });

  it("reports paused, never allowed, when screening cannot answer in production", async () => {
    env.USDC_SCREENING_REQUIRED = true;
    expect(await prepare()).toEqual({ refused: true, reason: "paused" });
  });
});

describe("wallet mismatch after an account switch", () => {
  const other = privateKeyToAccount(generatePrivateKey());

  it("prepares when the live wallet is the account's wallet", async () => {
    const result = await prepareUsdcSend(7, { to: friend, amount: "25", signer: fan.address }, NOW);
    expect(result.refused).toBe(false);
  });

  it("matches the account's wallet without regard to address case", async () => {
    const result = await prepareUsdcSend(
      7,
      { to: friend, amount: "25", signer: fan.address.toLowerCase() },
      NOW
    );
    expect(result.refused).toBe(false);
  });

  it("refuses and records wallet_mismatch when another account's wallet is live", async () => {
    const result = await prepareUsdcSend(
      7,
      { to: friend, amount: "25", signer: other.address },
      NOW
    );
    expect(result).toEqual({ refused: true, reason: "wallet_mismatch" });
    expect(USDC_COPY.refusal.wallet_mismatch).toMatch(/Sign out and sign back in/);
    const stored = db.usdcSend.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({ status: "refused", failureCode: "wallet_mismatch" });
    // Nothing was screened and no typed data was issued
    expect(db.screeningEvent.create).not.toHaveBeenCalled();
  });
});

describe("wallet.sendUsdc.abandon", () => {
  const id = Buffer.from("0190f1a2b3c4d5e6f708192a3b4c5d6e", "hex");
  const sendId = id.toString("hex");

  it("marks a screened send failed with the client cause", async () => {
    db.usdcSend.findFirst.mockResolvedValue({ id, status: "screened" });
    db.usdcSend.updateMany.mockResolvedValue({ count: 1 });
    const result = await abandonUsdcSend(7, { sendId, code: "wallet_mismatch" });
    expect(result).toEqual({ status: "failed" });
    expect(db.usdcSend.updateMany).toHaveBeenCalledWith({
      where: { id, status: "screened" },
      data: { status: "failed", failureCode: "client_wallet_mismatch" },
    });
  });

  it("never overwrites a send that already reached the relayer", async () => {
    db.usdcSend.findFirst.mockResolvedValue({ id, status: "confirmed" });
    const result = await abandonUsdcSend(7, { sendId, code: "sign_failed" });
    expect(result).toEqual({ status: "confirmed" });
    expect(db.usdcSend.updateMany).not.toHaveBeenCalled();
  });

  it("reports the current state when submit wins the race", async () => {
    db.usdcSend.findFirst
      .mockResolvedValueOnce({ id, status: "screened" })
      .mockResolvedValueOnce({ id, status: "submitting" });
    db.usdcSend.updateMany.mockResolvedValue({ count: 0 });
    const result = await abandonUsdcSend(7, { sendId, code: "sign_failed" });
    expect(result).toEqual({ status: "submitting" });
  });

  it("refuses another account's send", async () => {
    db.usdcSend.findFirst.mockResolvedValue(null);
    await expect(abandonUsdcSend(8, { sendId, code: "sign_failed" })).rejects.toThrow(
      "Unknown send."
    );
  });
});

describe("Admin, Money recent sends", () => {
  it("shows a screened send past its window as expired", async () => {
    const base = {
      userId: 7,
      toUserId: null,
      toAddress: friend,
      amount: 1_000_000n,
      failureCode: null,
      txHash: null,
      gasCostWei: null,
      screening: { unscreened: true },
      createdAt: new Date(),
    };
    db.usdcSend.findMany.mockResolvedValue([
      {
        ...base,
        id: Buffer.alloc(16, 1),
        status: "screened",
        validBefore: new Date(Date.now() - 60_000),
      },
      {
        ...base,
        id: Buffer.alloc(16, 2),
        status: "screened",
        validBefore: new Date(Date.now() + 60_000),
      },
    ]);
    (db.user as unknown as { findMany: ReturnType<typeof vi.fn> }).findMany = vi
      .fn()
      .mockResolvedValue([{ id: 7, handle: "johnlesterstaging" }]);
    const rows = await recentSends({ limit: 25 });
    expect(rows.map(row => row.status)).toEqual(["expired", "screened"]);
  });

  it("lists only rows still inside their window under Awaiting signature", async () => {
    db.usdcSend.findMany.mockResolvedValue([]);
    await recentSends({ limit: 25, status: "screened" });
    const where = db.usdcSend.findMany.mock.calls.at(-1)![0].where;
    expect(where.status).toBe("screened");
    expect(where.validBefore.gt).toBeInstanceOf(Date);
    expect(where.validBefore.gt.getTime()).toBeGreaterThan(Date.now() - 1_000);
  });

  it("lists the screened rows past their window under Expired", async () => {
    db.usdcSend.findMany.mockResolvedValue([]);
    await recentSends({ limit: 25, status: "expired" });
    const where = db.usdcSend.findMany.mock.calls.at(-1)![0].where;
    expect(where.status).toBe("screened");
    expect(where.validBefore.lte).toBeInstanceOf(Date);
    expect(where.validBefore.lte.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("wallet.sendUsdc.submit", () => {
  async function prepared() {
    const result = await prepareUsdcSend(7, { to: friend, amount: "3" }, NOW);
    if (result.refused) throw new Error("expected a prepared send");
    const data = db.usdcSend.create.mock.calls.at(-1)![0].data;
    const row = { ...data, id: new Uint8Array(data.id), status: "screened", txHash: null };
    db.usdcSend.findFirst.mockResolvedValue(row);
    const domain = await usdcDomain();
    const signature = await fan.signTypedData({
      domain,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: {
        ...result.typedData.message,
        value: BigInt(result.typedData.message.value),
        validAfter: 0n,
        validBefore: BigInt(result.typedData.message.validBefore),
      },
    });
    return { sendId: result.sendId, signature, row };
  }

  it("verifies the signature, claims the row once and submits through the relayer", async () => {
    const { sendId, signature } = await prepared();
    db.usdcSend.updateMany.mockResolvedValue({ count: 1 });
    relayer.submit.mockResolvedValue("0xabc" as Hex);
    chain.waitForTransactionReceipt.mockRejectedValue(new Error("timeout"));
    const result = await submitUsdcSend(7, { sendId, signature }, NOW, 1);
    expect(result).toEqual({ refused: false, status: "submitted", txHash: "0xabc" });
    expect(db.usdcSend.updateMany).toHaveBeenCalledWith({
      where: { id: expect.anything(), status: "screened" },
      data: { status: "submitting" },
    });
    expect(relayer.submit).toHaveBeenCalledWith(
      expect.objectContaining({ from: fan.address, to: friend, value: 3_000_000n }),
      signature,
      sendId
    );
  });

  it("records the relayer's gas from the receipt for the Admin, Money ledger", async () => {
    const { sendId, signature } = await prepared();
    db.usdcSend.updateMany.mockResolvedValue({ count: 1 });
    relayer.submit.mockResolvedValue("0xabc" as Hex);
    chain.waitForTransactionReceipt.mockResolvedValue({
      status: "success",
      gasUsed: 60_000n,
      effectiveGasPrice: 1_000_000n,
      blockNumber: 5n,
      logs: [],
    });
    chain.getBlock.mockResolvedValue({ timestamp: 1n });
    const result = await submitUsdcSend(7, { sendId, signature }, NOW, 1);
    expect(result).toEqual({ refused: false, status: "confirmed", txHash: "0xabc" });
    expect(db.usdcSend.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "confirmed",
          gasUsed: 60_000n,
          gasCostWei: 60_000_000_000n,
        }),
      })
    );
  });

  it("rejects a signature from another key and submits nothing", async () => {
    const { sendId } = await prepared();
    const other = privateKeyToAccount(generatePrivateKey());
    const forged = await other.signMessage({ message: "not this" });
    await expect(submitUsdcSend(7, { sendId, signature: forged }, NOW)).rejects.toThrow(
      /signature/
    );
    expect(relayer.submit).not.toHaveBeenCalled();
  });

  it("submits once when tapped twice", async () => {
    const { sendId, signature } = await prepared();
    db.usdcSend.updateMany.mockResolvedValue({ count: 0 });
    expect(await submitUsdcSend(7, { sendId, signature }, NOW)).toMatchObject({
      status: "submitted",
    });
    expect(relayer.submit).not.toHaveBeenCalled();
  });

  it("shows the paused line when the relayer is out of gas", async () => {
    const { sendId, signature } = await prepared();
    db.usdcSend.updateMany.mockResolvedValue({ count: 1 });
    const { RelayerError } = await import("../services/usdc/relayer");
    relayer.submit.mockRejectedValue(new RelayerError("out_of_gas", "low"));
    expect(await submitUsdcSend(7, { sendId, signature }, NOW)).toEqual({
      refused: true,
      reason: "paused",
    });
    expect(db.usdcSend.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "failed", failureCode: "out_of_gas" } })
    );
  });

  it("refuses an expired authorization", async () => {
    const { sendId, signature } = await prepared();
    const later = new Date(NOW.getTime() + 11 * 60 * 1000);
    await expect(submitUsdcSend(7, { sendId, signature }, later)).rejects.toThrow(/expired/);
  });
});

describe("relayer gas lines", () => {
  it("raises the alarm below 0.05 ETH and stops below 0.01 ETH", () => {
    expect(gasState(60_000_000_000_000_000n)).toMatchObject({ alarm: false, stopped: false });
    expect(gasState(40_000_000_000_000_000n)).toMatchObject({ alarm: true, stopped: false });
    expect(gasState(9_000_000_000_000_000n)).toMatchObject({ alarm: true, stopped: true });
  });
});

describe("CDP relayer (acceptance 4)", () => {
  it("maps a CDP policy refusal to policy_rejected and sends the call to the USDC contract only", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const ed = generateKeyPairSync("ed25519").privateKey.export({ format: "jwk" }) as {
      d: string;
      x: string;
    };
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    Object.assign(env, {
      CDP_API_KEY_SECRET: Buffer.concat([
        Buffer.from(ed.d, "base64url"),
        Buffer.from(ed.x, "base64url"),
      ]).toString("base64"),
      CDP_WALLET_SECRET: (
        ec.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer
      ).toString("base64"),
    });
    const { getRelayer, RelayerError } = await import("../services/usdc/relayer");
    setRelayerForTests(null);
    chain.getBalance.mockResolvedValue(10n ** 18n);
    chain.estimateGas.mockResolvedValue(80_000n);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ address: "0x9999999999999999999999999999999999999999" }))
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errorType: "policy_violation", errorMessage: "denied" }), {
          status: 403,
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const auth = buildTransferAuthorization({
      from: fan.address,
      to: friend,
      value: 1n,
      now: NOW,
      ttlSeconds: 600,
    });
    const signature = await fan.signTypedData({
      domain: await usdcDomain(),
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: "TransferWithAuthorization",
      message: auth,
    });
    const error = await getRelayer()
      .submit(auth, signature, "id1")
      .catch(e => e);
    vi.unstubAllGlobals();
    expect(error).toBeInstanceOf(RelayerError);
    expect(error.code).toBe("policy_rejected");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toMatch(
      /\/v2\/evm\/accounts\/0x9999999999999999999999999999999999999999\/send\/transaction$/
    );
    expect(init.headers["X-Wallet-Auth"]).toBeTruthy();
    expect(init.headers["X-Idempotency-Key"]).toBe("id1");
    expect(JSON.parse(init.body).network).toBe("base-sepolia");
    expect(chain.estimateGas).toHaveBeenCalledWith(
      expect.objectContaining({ to: usdcAddress(), value: 0n })
    );
  });
});

describe("indexer", () => {
  it("reads only confirmed blocks and starts 200 blocks back", () => {
    const head = 10_000n;
    expect(nextRange(null, head)).toEqual({
      from: head - CONFIRMATIONS - INITIAL_LOOKBACK,
      to: head - CONFIRMATIONS,
    });
    expect(nextRange(head - CONFIRMATIONS, head)).toBeNull();
    expect(nextRange(100n, head)).toEqual({ from: 101n, to: 100n + MAX_RANGE });
  });

  it("writes one row per log, skips logs touching no member and is idempotent", async () => {
    db.userWallet.findMany.mockResolvedValue([{ address: fan.address.toLowerCase(), userId: 7 }]);
    db.usdcSend.findMany.mockResolvedValue([]);
    db.onrampSession.findMany.mockResolvedValue([]);
    db.paymentEvent.create.mockResolvedValueOnce({}).mockRejectedValueOnce({ code: "P2002" });
    const transfer = {
      txHash: "0xaa" as Hex,
      logIndex: 3,
      blockNumber: 5n,
      from: fan.address,
      to: friend,
      value: 1_000_000n,
    };
    const stranger = { ...transfer, logIndex: 4, from: friend, to: sanctioned };
    const at = () => NOW;
    expect(await recordUsdcTransfers([transfer, stranger], at)).toBe(1);
    expect(db.paymentEvent.create.mock.calls[0][0].data).toMatchObject({
      payerUserId: 7,
      payeeUserId: null,
    });
    expect(await recordUsdcTransfers([transfer], at)).toBe(0);
  });
});

describe("CDP request signing", () => {
  it("hashes the body with sorted keys into the wallet JWT", async () => {
    expect(JSON.stringify(sortKeys({ b: 1, a: { d: 2, c: 3 } }))).toBe('{"a":{"c":3,"d":2},"b":1}');
    const { generateKeyPairSync } = await import("node:crypto");
    const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const secret = (key.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer).toString(
      "base64"
    );
    const token = await cdpWalletJwt(
      secret,
      "POST",
      "/platform/v2/evm/accounts/0x1/send/transaction",
      {
        network: "base-sepolia",
        transaction: "0x02",
      }
    );
    const claims = decodeJwt(token);
    expect(claims.uris).toEqual([
      "POST api.cdp.coinbase.com/platform/v2/evm/accounts/0x1/send/transaction",
    ]);
    expect(claims.reqHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("copy (spec 3.9, acceptance 15)", () => {
  const lines = [USDC_COPY.receiveNotice, USDC_COPY.feeLine, ...Object.values(USDC_COPY.refusal)];

  it("has no dashes and no staking or testnet words", () => {
    for (const line of lines) {
      expect(line).not.toMatch(/[–—]/);
      expect(line).not.toMatch(/\b(stake|staking|pool|tREVO|credit card)\b/i);
    }
  });

  it("parses typed amounts strictly", () => {
    expect(parseUsdc("25")).toBe(25_000_000n);
    expect(parseUsdc("0.000001")).toBe(1n);
    expect(parseUsdc("0")).toBeNull();
    expect(parseUsdc("1.0000001")).toBeNull();
    expect(parseUsdc("-1")).toBeNull();
    expect(parseUsdc("1e3")).toBeNull();
  });
});
