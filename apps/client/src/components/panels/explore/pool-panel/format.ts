import Decimal from "decimal.js";
import { BaseError, formatEther } from "viem";

// Amounts convention (Screen Review 046): up to 4 decimals, trailing zeros
// removed, rounded down so a shown balance is never more than the real one.
export function formatTokenAmount(value: bigint | string | number | Decimal): string {
  const decimal =
    typeof value === "bigint" ? new Decimal(formatEther(value)) : new Decimal(value || 0);
  const floored = decimal.toDecimalPlaces(4, Decimal.ROUND_DOWN);
  const [whole, fraction] = floored.toFixed().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

// The exact amount (no rounding) with digit grouping, for Review rows and the
// commit label: the person sees exactly what they entered.
export function formatExactAmount(value: Decimal | string | number): string {
  const [whole, fraction] = new Decimal(value || 0).toFixed().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

// Typed amounts keep at most 4 decimals (12.34567 keeps 12.3456).
export function limitDecimals(value: string, decimals = 4): string {
  const [whole, fraction] = value.split(".");
  if (fraction === undefined || fraction.length <= decimals) return value;
  return `${whole}.${fraction.slice(0, decimals)}`;
}

// A preset share of an amount, rounded down to 4 decimals.
export function presetAmount(total: Decimal, share: number): string {
  return total.mul(share).toDecimalPlaces(4, Decimal.ROUND_DOWN).toFixed();
}

export function toDecimal(value: string): Decimal | null {
  if (!value || value === ".") return null;
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

// Network Reward Rate (J2). The server returns basis points (1250 = 12.5%).
export function formatRewardRate(basisPoints: number): string {
  return `${(basisPoints / 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}% a year (est.)`;
}

export type TxErrorKind = "rejected" | "cooldown" | "failed";

// Wallet and contract errors become one of three plain causes. Raw error text
// is never shown (Screen Review 048 I13).
export function classifyTxError(error: unknown): TxErrorKind {
  const matches = (test: (err: unknown) => boolean) => {
    if (error instanceof BaseError) return !!error.walk(test);
    return test(error);
  };
  const isRejected = matches(err => {
    const candidate = err as { name?: string; code?: number; message?: string };
    return (
      candidate?.name === "UserRejectedRequestError" ||
      candidate?.code === 4001 ||
      /user (rejected|denied|cancel)/i.test(candidate?.message ?? "")
    );
  });
  if (isRejected) return "rejected";
  const isCooldown = matches(err => {
    const candidate = err as { data?: { errorName?: string }; message?: string };
    return (
      candidate?.data?.errorName === "UnstakingCooldown" ||
      /UnstakingCooldown/.test(candidate?.message ?? "")
    );
  });
  return isCooldown ? "cooldown" : "failed";
}
