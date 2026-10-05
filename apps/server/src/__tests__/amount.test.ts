/**
 * Tests for sanitizeAmount (packages/constants/src/amount.ts), the input filter of
 * the Prism AmountWell used by stake, send and other money flows.
 */
import { describe, it, expect } from "vitest";
import { sanitizeAmount } from "@repo/constants";

describe("sanitizeAmount", () => {
  it.each([
    ["", ""],
    ["15", "15"],
    ["1.5", "1.5"],
    [".5", ".5"],
    ["1.", "1."],
    ["1 000", "1000"],
    ["abc12", "12"],
  ])("keeps %j as %j", (raw, expected) => {
    expect(sanitizeAmount(raw, "")).toBe(expected);
  });

  it("treats a decimal comma as the decimal point", () => {
    expect(sanitizeAmount("1,5", "1")).toBe("1.5");
    expect(sanitizeAmount("0,25", "0.2")).toBe("0.25");
  });

  it("keeps the previous value when there is more than one separator", () => {
    expect(sanitizeAmount("1.2.3", "1.2")).toBe("1.2");
    expect(sanitizeAmount("1,2.3", "1.2")).toBe("1.2");
    expect(sanitizeAmount("1.000,50", "1.000")).toBe("1.000");
  });
});
