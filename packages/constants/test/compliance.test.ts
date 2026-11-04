import {
  ACCESS_BANNED_TERMS,
  ACCESS_STAKE_DISCLOSURE,
  CONTENT_BANNED_TERMS,
  PLATFORM_FEE_BPS,
  contentAccessInputSchema,
  findComplianceTerms,
} from "../src/index";

// Content gating spec 4.3 and section 5.

describe("compliance constants", () => {
  it("exports the four constants", () => {
    expect(typeof ACCESS_STAKE_DISCLOSURE).toBe("string");
    expect(ACCESS_STAKE_DISCLOSURE.length).toBeGreaterThan(20);
    expect(PLATFORM_FEE_BPS).toBe(500);
    for (const term of CONTENT_BANNED_TERMS) expect(ACCESS_BANNED_TERMS).toContain(term);
    for (const term of ["member", "members", "membership", "buy", "purchase", "price"]) {
      expect(ACCESS_BANNED_TERMS).toContain(term);
    }
  });

  it("keeps the disclosure free of dashes and content banned terms", () => {
    expect(ACCESS_STAKE_DISCLOSURE).not.toMatch(/[–—]/);
    const raw = ACCESS_STAKE_DISCLOSURE.toLowerCase();
    const hits = CONTENT_BANNED_TERMS.filter(t =>
      new RegExp(`(^|[^a-z0-9])${t.toLowerCase()}([^a-z0-9]|$)`).test(raw)
    );
    expect(hits).toEqual([]);
  });

  it("finds banned words outside the disclosure only", () => {
    expect(
      findComplianceTerms(`Pool fans. ${ACCESS_STAKE_DISCLOSURE}`, ACCESS_BANNED_TERMS)
    ).toEqual([]);
    expect(findComplianceTerms("Pool members only", ACCESS_BANNED_TERMS)).toEqual(["members"]);
    expect(findComplianceTerms("Earn APY", CONTENT_BANNED_TERMS)).toEqual(["earn", "APY"]);
    expect(findComplianceTerms("Learning", CONTENT_BANNED_TERMS)).toEqual([]);
  });
});

describe("content access input", () => {
  it("takes Everyone, a saved rule, a leaf and Any of these", () => {
    expect(contentAccessInputSchema.safeParse({ ruleId: "a".repeat(32) }).success).toBe(true);
    expect(contentAccessInputSchema.safeParse({ kind: "follower", params: {} }).success).toBe(true);
    expect(
      contentAccessInputSchema.safeParse({
        kind: "stake_min",
        params: { poolId: 3, minTrevo: "100" },
      }).success
    ).toBe(true);
    expect(
      contentAccessInputSchema.safeParse({
        kind: "any",
        leaves: [
          { kind: "follower", params: {} },
          { kind: "pool_member", params: { poolId: 3 } },
        ],
      }).success
    ).toBe(true);
  });

  it("refuses Members, Paid, one leaf Any and nested Any", () => {
    expect(
      contentAccessInputSchema.safeParse({ kind: "member", params: { planId: 1 } }).success
    ).toBe(false);
    expect(
      contentAccessInputSchema.safeParse({
        kind: "any",
        leaves: [{ kind: "follower", params: {} }],
      }).success
    ).toBe(false);
    expect(
      contentAccessInputSchema.safeParse({
        kind: "stake_min",
        params: { poolId: 3, minTrevo: "0" },
      }).success
    ).toBe(false);
  });
});
