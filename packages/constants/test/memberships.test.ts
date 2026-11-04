/** Memberships helpers (MB-1): amounts, the yearly saving, grace days and the copy. */
import { describe, expect, it } from "vitest";
import { MEMBERSHIP_COPY, dollarsToUnits, graceDay, yearlySavingPercent } from "../src/memberships";

describe("memberships helpers", () => {
  it("reads dollars as USDC units", () => {
    expect(dollarsToUnits("5")).toBe(5_000_000n);
    expect(dollarsToUnits("12.5")).toBe(12_500_000n);
    expect(dollarsToUnits("12.555")).toBeNull();
    expect(dollarsToUnits("-1")).toBeNull();
  });

  it("saves only when yearly is under 12 periods", () => {
    expect(yearlySavingPercent(5_000_000n, 48_000_000n)).toBe(20);
    expect(yearlySavingPercent(5_000_000n, 60_000_000n)).toBeNull();
    expect(yearlySavingPercent(5_000_000n, null)).toBeNull();
  });

  it("counts grace days from 1 to 7", () => {
    const since = new Date("2026-11-01T00:00:00Z");
    expect(graceDay(since, new Date("2026-11-01T05:00:00Z"))).toBe(1);
    expect(graceDay(since, new Date("2026-11-03T05:00:00Z"))).toBe(3);
    expect(graceDay(since, new Date("2026-11-20T05:00:00Z"))).toBe(7);
  });

  it("never says monthly, a month, price or uses dashes", () => {
    const all: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") all.push(v);
      else if (typeof v === "function")
        all.push(
          String((v as (...a: unknown[]) => unknown)("x", "$5 USDC", "every 30 days", "Nov 3"))
        );
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(MEMBERSHIP_COPY);
    expect(all.filter(s => /monthly|a month|\bprice\b|[–—]/i.test(s))).toEqual([]);
  });
});
