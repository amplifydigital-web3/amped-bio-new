import { describe, expect, it } from "vitest";
import { unitsFromUsdc } from "./StoreTab";

describe("unitsFromUsdc", () => {
  it("reads plain USDC amounts with up to 6 decimals", () => {
    expect(unitsFromUsdc("3")).toBe(3_000_000n);
    expect(unitsFromUsdc("3.5")).toBe(3_500_000n);
    expect(unitsFromUsdc(" 0.50 ")).toBe(500_000n);
    expect(unitsFromUsdc("1000.000001")).toBe(1_000_000_001n);
  });
  it("refuses anything else", () => {
    for (const bad of ["", "abc", "1.2345678", "-1", "1,000", "$3"])
      expect(unitsFromUsdc(bad)).toBeNull();
  });
});
