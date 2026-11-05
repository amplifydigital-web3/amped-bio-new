import { afterEach, describe, expect, it, vi } from "vitest";
import { moneySheetColors } from "@repo/ui";

const query = vi.hoisted(() => vi.fn());
const pay = vi.hoisted(() => ({ prepare: vi.fn(), submit: vi.fn(), status: vi.fn() }));
vi.mock("@repo/ui", async importOriginal => ({
  ...(await importOriginal<typeof import("@repo/ui")>()),
  trpcClient: {
    checkout: { quote: { query } },
    payments: {
      pay: { prepare: { mutate: pay.prepare }, submit: { mutate: pay.submit } },
      status: { query: pay.status },
    },
  },
}));

import { createAmpedPayProvider, createMockProvider, mockOutcome } from "./provider";

const ready = {
  id: "ab".repeat(16),
  status: "open",
  state: "ready" as const,
  provider: "mock" as const,
  item: {
    title: "Episode 4",
    publicId: "abc123",
    kind: "VIDEO",
    adult: false,
    path: "/maya/c/abc123",
    accessPeriodDays: null,
  },
  creator: { handle: "maya", name: "Maya", image: null, theme: null },
  policy: null,
  amount: "3000000",
  fee: "150000",
  feeBps: 500,
  quotedAt: new Date().toISOString(),
  validUntil: new Date().toISOString(),
};

afterEach(() => {
  query.mockReset();
  Object.values(pay).forEach(mock => mock.mockReset());
});

// Mobile checkout CK-2 (docs/features/mobile-checkout.md 5): the legibility guard
describe("moneySheetColors", () => {
  it("keeps the creator button when its label reads at 4.5:1", () => {
    const colors = moneySheetColors({
      buttonColor: "#16152B",
      fontColor: "#FFFFFF",
      containerColor: "#16152B",
    });
    expect(colors.guarded).toBe(false);
    expect(colors.button.background.toLowerCase()).toBe("#16152b");
  });

  it("turns the button neutral with the creator color as its border when it cannot read", () => {
    const colors = moneySheetColors({
      buttonColor: "#FFFF66",
      fontColor: "#FFFFFF",
      containerColor: "#FFFFFF",
    });
    // White on pale yellow fails; ink on pale yellow reads, so the label switches to ink
    expect(colors.guarded).toBe(true);
    expect(colors.button.color.toLowerCase()).toBe("#16152b");
  });

  it("puts text on a white surface when the creator text cannot read on the container", () => {
    const colors = moneySheetColors({ fontColor: "#EEEEEE", containerColor: "#FFFFFF" });
    expect(colors.surface.toLowerCase()).toBe("#ffffff");
    expect(colors.text.toLowerCase()).toBe("#16152b");
  });
});

describe("the mock payment provider", () => {
  it("reads QA outcomes from ?mock= and ignores unknown ones", () => {
    expect(mockOutcome("?mock=short")).toBe("short");
    expect(mockOutcome("?mock=steal")).toBeNull();
    expect(mockOutcome("")).toBeNull();
  });

  it("passes the server quote through and pays", async () => {
    query.mockResolvedValue(ready);
    const provider = createMockProvider(null);
    expect(await provider.quote(ready.id)).toEqual(ready);
    expect(provider.balanceOverride()).toBeNull();
    expect(provider.seedLastSeen(ready)).toBeNull();
    vi.useFakeTimers();
    const paid = provider.pay(ready.id, ready);
    await vi.runAllTimersAsync();
    expect(await paid).toEqual({ result: "paid" });
    vi.useRealTimers();
  });

  it("reaches every error state for QA", async () => {
    query.mockResolvedValue(ready);
    for (const state of ["paused", "limit", "seller"] as const) {
      expect((await createMockProvider(state).quote(ready.id)).state).toBe(state);
    }
    const removed = await createMockProvider("removed").quote(ready.id);
    expect(removed.state).toBe("removed");
    expect(removed.item).toBeNull();
    expect(createMockProvider("short").balanceOverride()).toBe(0n);
    expect(createMockProvider("price").seedLastSeen(ready)).toBe("2000000");
    vi.useFakeTimers();
    const failed = createMockProvider("failed").pay(ready.id, ready);
    await vi.runAllTimersAsync();
    expect(await failed).toEqual({ result: "failed" });
    vi.useRealTimers();
  });
});

describe("the AmpedPay provider (CK-5)", () => {
  const FAN = "0x00000000000000000000000000000000000000f1" as const;
  const PURCHASE = "cd".repeat(16);
  const prepared = {
    refused: false,
    purchaseId: PURCHASE,
    typedData: {
      domain: {
        name: "USDC",
        version: "2",
        chainId: 84532,
        verifyingContract: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      },
      types: {
        ReceiveWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "ReceiveWithAuthorization",
      message: {
        from: FAN,
        to: "0x00000000000000000000000000000000000000a1",
        value: "3000000",
        validAfter: "0",
        validBefore: "1900000000",
        nonce: `0x${"11".repeat(32)}`,
      },
    },
    review: { payer: FAN },
  };
  const wait = async () => {};
  const amped = (sign = vi.fn(async () => `0x${"aa".repeat(65)}` as const)) => ({
    sign,
    provider: createAmpedPayProvider({ sign, signer: FAN, wait }),
  });

  it("prepares with the shown amount, signs as the server's payer, submits and opens at soft", async () => {
    pay.prepare.mockResolvedValue(prepared);
    pay.submit.mockResolvedValue({
      refused: false,
      purchaseId: PURCHASE,
      status: "confirmed_soft",
    });
    const { sign, provider } = amped();
    expect(await provider.pay(ready.id, { ...ready, provider: "ampedpay" })).toEqual({
      result: "paid",
    });
    expect(pay.prepare).toHaveBeenCalledWith({
      intentId: ready.id,
      amount: "3000000",
      signer: FAN,
      policyVersion: undefined,
    });
    const typed = (sign.mock.calls[0] as unknown[])[0] as {
      account: string;
      message: { value: bigint };
    };
    expect(typed.account).toBe(FAN);
    expect(typed.message.value).toBe(3_000_000n);
    expect(pay.submit).toHaveBeenCalledWith({
      purchaseId: PURCHASE,
      signature: `0x${"aa".repeat(65)}`,
    });
  });

  it("polls until the payment lands, and reports pending after the wait", async () => {
    pay.prepare.mockResolvedValue(prepared);
    pay.submit.mockResolvedValue({ refused: false, purchaseId: PURCHASE, status: "submitted" });
    pay.status.mockResolvedValueOnce({ status: "submitted" }).mockResolvedValueOnce({
      status: "confirmed_soft",
    });
    expect(await amped().provider.pay(ready.id, ready)).toEqual({ result: "paid" });
    pay.status.mockReset();
    pay.status.mockResolvedValue({ status: "submitted" });
    expect(await amped().provider.pay(ready.id, ready)).toEqual({ result: "pending" });
  });

  it("passes refusals through and sends nothing", async () => {
    pay.prepare.mockResolvedValue({
      refused: true,
      reason: "insufficient_balance",
      shortBy: "2000000",
    });
    const { sign, provider } = amped();
    expect(await provider.pay(ready.id, ready)).toEqual({
      result: "refused",
      reason: "insufficient_balance",
      shortBy: "2000000",
      amount: undefined,
      policyVersion: undefined,
    });
    expect(sign).not.toHaveBeenCalled();
    expect(pay.submit).not.toHaveBeenCalled();
  });

  it("sends the accepted policy version and reads owned as paid", async () => {
    pay.prepare.mockResolvedValue({ refused: true, reason: "owned" });
    expect(await amped().provider.pay(ready.id, ready, { policyVersion: 3 })).toEqual({
      result: "paid",
    });
    expect(pay.prepare.mock.calls[0]![0]).toMatchObject({ policyVersion: 3 });
  });

  it("a wallet cancel is rejected and submits nothing", async () => {
    pay.prepare.mockResolvedValue(prepared);
    const sign = vi.fn(async () => {
      throw Object.assign(new Error("User rejected the request"), { code: 4001 });
    });
    expect(await amped(sign).provider.pay(ready.id, ready)).toEqual({ result: "rejected" });
    expect(pay.submit).not.toHaveBeenCalled();
  });
});
