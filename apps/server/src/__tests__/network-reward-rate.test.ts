/**
 * QA-025: one formatter for the Network Reward Rate, so the editor pool panel
 * and the public pool block show the same figure for the same pool.
 */
import { describe, it, expect } from "vitest";
import { formatNetworkRewardRate } from "@repo/constants";

describe("formatNetworkRewardRate", () => {
  it("shows one decimal at most with the approved suffix", () => {
    expect(formatNetworkRewardRate(1250)).toBe("12.5% a year (est.)");
    expect(formatNetworkRewardRate(40)).toBe("0.4% a year (est.)");
    expect(formatNetworkRewardRate(75)).toBe("0.8% a year (est.)");
    expect(formatNetworkRewardRate(123456)).toBe("1,234.6% a year (est.)");
  });
});
