/**
 * #210: getUserStakedPools caches its result in Redis. A cached read must return
 * the same types as a fresh one: bigints stay bigints, dates stay dates, and a
 * string made of digits (a pool named "2025") stays a string.
 */
import { describe, expect, it } from "vitest";
import { decodeCached, encodeCached } from "../utils/cacheCodec";

describe("staked pools cache codec", () => {
  it("round trips bigints, dates and digit only strings", () => {
    const value = [
      {
        userWalletId: 7,
        pool: {
          id: 1,
          name: "2025",
          address: "0xabc",
          image: null,
          pendingRewards: 123456789012345678901234n,
          stakedByYou: 0n,
          lastClaim: new Date("2026-11-06T12:00:00Z"),
        },
      },
    ];
    const back = decodeCached<typeof value>(encodeCached(value));
    expect(back).toEqual(value);
    expect(typeof back[0].pool.name).toBe("string");
    expect(back[0].pool.lastClaim).toBeInstanceOf(Date);
    expect(typeof back[0].pool.pendingRewards).toBe("bigint");
  });
});
