import { format, fromUnixTime } from "date-fns";
import { formatEther } from "viem";

// Screen Review 078 I03, I04, I16. One precision rule and one duration
// formatter for every RNS figure: Name, Review, the wallet note context and
// the result.

const group = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * 0.0001 or more: up to 4 decimals, trailing zeros removed, rounded toward
 * zero. Smaller nonzero amounts: two significant digits (0.0000082). A
 * nonzero amount never renders as 0.
 */
export function formatRnsAmount(wei: bigint): string {
  if (wei === 0n) return "0";
  const negative = wei < 0n;
  const [whole, fraction = ""] = formatEther(negative ? -wei : wei).split(".");
  let shown: string;
  if (whole !== "0" || fraction.slice(0, 4) !== "0000") {
    const cut = fraction.slice(0, 4).replace(/0+$/, "");
    shown = cut ? `${group(whole)}.${cut}` : group(whole);
  } else {
    const firstDigit = fraction.search(/[1-9]/);
    shown = `0.${fraction.slice(0, firstDigit + 2).replace(/0+$/, "")}`;
  }
  return negative ? `-${shown}` : shown;
}

/** Registration dates: 30 Dec 2026 */
export const formatRnsDate = (seconds: number) => format(fromUnixTime(seconds), "d MMM yyyy");

/** 6 plus 4 address: 0x7a3F…c91E */
export const shortAddress = (address: string) =>
  address.length > 10 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

export const SECONDS_IN_MONTH = 2_592_000; // 30 days, the registrar month
export const SECONDS_IN_YEAR = 31_536_000;
export const MAX_TERM_MONTHS = 60;

export type TermUnit = "month" | "year";

/** A term the person picks: a count of whole months or whole years. */
export type Term = { unit: TermUnit; count: number };

export const termSeconds = ({ unit, count }: Term): bigint => {
  if (unit === "year") return BigInt(count * SECONDS_IN_YEAR);
  const years = Math.floor(count / 12);
  return BigInt(years * SECONDS_IN_YEAR + (count % 12) * SECONDS_IN_MONTH);
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** 1 month, 11 months, 2 years, 1 year 1 month */
export function formatTerm({ unit, count }: Term): string {
  if (unit === "year") return plural(count, "year");
  if (count < 12) return plural(count, "month");
  const years = Math.floor(count / 12);
  const months = count % 12;
  return months ? `${plural(years, "year")} ${plural(months, "month")}` : plural(years, "year");
}

/**
 * Presets and limits from the contract minimum (078 I02): under one year the
 * unit is the month (1, 3, 6 months and 1 year); one year or more the unit is
 * the year (1, 2, 3, 5 years). The minimum is the default.
 */
export function termRules(minSeconds: bigint) {
  const min = Number(minSeconds);
  if (min >= SECONDS_IN_YEAR) {
    const minCount = Math.ceil(min / SECONDS_IN_YEAR);
    return {
      unit: "year" as const,
      min: minCount,
      max: 5,
      presets: [1, 2, 3, 5].filter(n => n >= minCount),
    };
  }
  const minCount = Math.max(1, Math.ceil(min / SECONDS_IN_MONTH));
  return {
    unit: "month" as const,
    min: minCount,
    max: MAX_TERM_MONTHS,
    presets: [1, 3, 6, 12].filter(n => n >= minCount),
  };
}
