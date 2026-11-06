/** Store Sales helpers (C10): month keys, the CSV picker and safe CSV fields. */
import { describe, expect, it } from "vitest";
import {
  STORE_SALES_COPY,
  csvField,
  recentSalesMonths,
  salesMonthLabel,
  salesMonthOf,
  storeRefundSubmitSchema,
} from "../src/storeSales";

describe("store sales helpers", () => {
  it("keys months in UTC and lists the last twelve, newest first", () => {
    expect(salesMonthOf(new Date("2026-11-30T23:59:59Z"))).toBe("2026-11");
    const months = recentSalesMonths(new Date("2026-02-10T00:00:00Z"));
    expect(months).toHaveLength(12);
    expect(months.slice(0, 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
    expect(salesMonthLabel("2026-11")).toBe("November 2026");
  });

  it("quotes CSV fields and neutralizes formulas", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('a "b", c')).toBe('"a ""b"", c"');
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("@handle")).toBe("'@handle");
    expect(csvField(null)).toBe("");
  });

  it("takes only 65 byte signatures on submit", () => {
    const ok = {
      purchaseId: "01".repeat(16),
      deadline: "1793800000",
      refundSignature: `0x${"aa".repeat(65)}`,
      permitDeadline: "1793800000",
      permitSignature: `0x${"bb".repeat(65)}`,
    };
    expect(storeRefundSubmitSchema.safeParse(ok).success).toBe(true);
    expect(storeRefundSubmitSchema.safeParse({ ...ok, refundSignature: "0x12" }).success).toBe(
      false
    );
  });

  it("has no dashes in the copy", () => {
    const all: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") all.push(v);
      else if (typeof v === "function")
        all.push(String((v as (...a: unknown[]) => unknown)("x", 2)));
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(STORE_SALES_COPY);
    expect(all.filter(s => /[–—]/.test(s))).toEqual([]);
  });
});
