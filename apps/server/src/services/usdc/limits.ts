import { USDC_SEND_LIMITS } from "@repo/constants";

/** Start of the current UTC day: limits reset at 00:00 UTC (decision 7). */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Decision 7: 10 sends and 2,000 USDC per account per UTC day. `count` and
 * `units` are today's sends already submitted or confirmed.
 */
export function withinDailyLimits(
  today: { count: number; units: bigint },
  amount: bigint
): boolean {
  if (today.count + 1 > USDC_SEND_LIMITS.dailyCount) return false;
  return today.units + amount <= USDC_SEND_LIMITS.dailyUnits;
}

/** Statuses that count toward the daily limits. */
export const COUNTED_SEND_STATUSES = ["submitting", "submitted", "confirmed"] as const;
