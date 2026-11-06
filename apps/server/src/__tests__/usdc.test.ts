/**
 * USDC in the wallet (Build Board #29, docs/features/usdc-wallet-onramp.md 3.3).
 * The payment chain, Circle's USDC addresses and the USD display rule
 * (spec decision 8) are shared by the client and, from USDC-2, the relayer.
 */
import { describe, it, expect } from "vitest";
import { USDC_DECIMALS, formatUsdc, getPaymentChain, getUsdcAddress } from "@repo/web3";

describe("getPaymentChain", () => {
  it("is Base only when the config says base", () => {
    expect(getPaymentChain("base").id).toBe(8453);
  });

  it("falls back to Base Sepolia for anything else, so staging never points at mainnet", () => {
    expect(getPaymentChain("base-sepolia").id).toBe(84532);
    expect(getPaymentChain(undefined).id).toBe(84532);
    expect(getPaymentChain(null).id).toBe(84532);
    expect(getPaymentChain("Base").id).toBe(84532);
  });
});

describe("getUsdcAddress", () => {
  it("returns Circle's native USDC on Base and Base Sepolia", () => {
    expect(getUsdcAddress(8453)).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(getUsdcAddress(84532)).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  });

  it("returns null for chains with no USDC, such as Libertas", () => {
    expect(getUsdcAddress(73863)).toBeNull();
  });
});

describe("formatUsdc", () => {
  const units = (usd: string) => BigInt(Math.round(Number(usd) * 10 ** USDC_DECIMALS));

  it("shows two decimals by default, truncating rather than rounding up", () => {
    expect(formatUsdc(units("25"))).toBe("25.00");
    expect(formatUsdc(units("0.999999"))).toBe("0.99");
    expect(formatUsdc(0n)).toBe("0.00");
  });

  it("groups thousands", () => {
    expect(formatUsdc(units("1234.56"))).toBe("1,234.56");
    expect(formatUsdc(units("1000000"))).toBe("1,000,000.00");
  });

  it("keeps up to four significant decimals in balances, never fewer than two", () => {
    expect(formatUsdc(units("25"), 4)).toBe("25.00");
    expect(formatUsdc(units("25.5"), 4)).toBe("25.50");
    expect(formatUsdc(units("25.5012"), 4)).toBe("25.5012");
    expect(formatUsdc(units("25.501"), 4)).toBe("25.501");
    expect(formatUsdc(123n, 4)).toBe("0.0001");
  });
});
