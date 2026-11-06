import { parseUnits } from "viem";
import { USDC_DECIMALS } from "@repo/web3";

/**
 * Coinbase sends money as decimal strings ("25.00", "23.490000"), and the v1
 * status API sometimes as { value, currency }. These helpers turn them into
 * cents and USDC base units without floating point.
 */

type Amount = string | number | { value?: string | number } | null | undefined;

function decimalOf(value: Amount): string | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "object" ? value.value : value;
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  return /^\d+(\.\d+)?$/.test(text) ? text : null;
}

/** "25.5" to 2550. Extra decimals are cut, never rounded up. */
export function toCents(value: Amount): number | null {
  const text = decimalOf(value);
  if (text === null) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 2550 to "25.50". */
export function fromCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** "23.49" USDC to base units. Decimals past six are cut. */
export function toUsdcUnits(value: Amount): bigint | null {
  const text = decimalOf(value);
  if (text === null) return null;
  const [whole, fraction = ""] = text.split(".");
  try {
    return parseUnits(`${whole}.${fraction.slice(0, USDC_DECIMALS) || "0"}`, USDC_DECIMALS);
  } catch {
    return null;
  }
}

/** What the fan typed in the amount well: up to two decimals, above zero. */
export function parseFiatInput(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const cents = toCents(text);
  return cents && cents > 0 ? cents : null;
}
