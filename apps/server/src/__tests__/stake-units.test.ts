/**
 * G0 (gating spec v2, 2.2): creators type a whole number of tREVO, stakes are
 * mirrored in wei. wholeTokensToWei is the one conversion between the two.
 */
import { describe, it, expect } from "vitest";
import { TREVO_DECIMALS, wholeTokensToWei } from "@repo/constants";

describe("wholeTokensToWei", () => {
  it("converts whole tREVO to wei with 18 decimals", () => {
    expect(TREVO_DECIMALS).toBe(18);
    expect(wholeTokensToWei("1")).toBe("1000000000000000000");
    expect(wholeTokensToWei("500")).toBe("500000000000000000000");
    expect(wholeTokensToWei("0")).toBe("0");
  });

  it("keeps precision past the float range", () => {
    expect(wholeTokensToWei("123456789012345678901234567890")).toBe(
      "123456789012345678901234567890000000000000000000"
    );
  });

  it("refuses anything that is not a whole number", () => {
    for (const bad of ["", "1.5", "-1", "1e3", " 10", "abc"]) {
      expect(wholeTokensToWei(bad)).toBeNull();
    }
  });
});
