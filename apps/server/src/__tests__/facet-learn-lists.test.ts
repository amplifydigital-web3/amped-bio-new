/**
 * Screen Review 107 I03 and I07: the facet request lists come from every scope
 * in the request, and the expiry line reads the server value.
 */
import { describe, it, expect } from "vitest";
import {
  FACET_CATALOG,
  buildFacetLearnLists,
  describeFacetScope,
  formatProofLifetime,
  isFacetScope,
} from "@repo/ui/oauth/facet-scopes";

const over18 = FACET_CATALOG.age_over_18!;

describe("facet scopes", () => {
  it("recognizes facet scopes and their catalog entry", () => {
    expect(isFacetScope("facet:age_over_18")).toBe(true);
    expect(isFacetScope("profile")).toBe(false);
    expect(describeFacetScope("facet:age_over_18")?.label).toBe("Over 18");
    expect(describeFacetScope("facet:unknown")).toBeNull();
    expect(describeFacetScope("profile")).toBeNull();
  });
});

describe("buildFacetLearnLists", () => {
  it("keeps the board lists for a facet only request", () => {
    const lists = buildFacetLearnLists(["openid", "facet:age_over_18"], over18);
    expect(lists.learn).toEqual([
      "Yes, you are over 18",
      "Authbase checked it",
      "Made for this request only",
    ]);
    expect(lists.notLearn).toEqual([
      "Your birthdate",
      "Your name or ID number",
      "Your wallet history",
    ]);
  });

  it("lists the name, picture and wallet address under THEY LEARN when profile is requested", () => {
    const lists = buildFacetLearnLists(["openid", "profile", "facet:age_over_18"], over18);
    expect(lists.learn).toEqual([
      "Yes, you are over 18",
      "Your name and profile picture",
      "Your wallet address",
      "Authbase checked it",
      "Made for this request only",
    ]);
    expect(lists.notLearn).toEqual(["Your birthdate", "Your ID number"]);
  });

  it("lists the email address when email is requested", () => {
    const lists = buildFacetLearnLists(["email", "facet:age_over_18"], over18);
    expect(lists.learn).toContain("Your email address");
    expect(lists.notLearn).toContain("Your wallet history");
  });

  it("never lists the same item in both columns", () => {
    const combos = [[], ["profile"], ["email"], ["profile", "email"]];
    for (const extra of combos) {
      const lists = buildFacetLearnLists([...extra, "facet:age_over_18"], over18);
      const overlap = lists.learn.filter(item => lists.notLearn.includes(item));
      expect(overlap).toEqual([]);
      if (extra.includes("profile")) {
        expect(lists.notLearn.some(item => /wallet|name/i.test(item))).toBe(false);
      }
    }
  });
});

describe("formatProofLifetime", () => {
  it("reads the server value", () => {
    expect(formatProofLifetime(600)).toBe("10 minutes");
    expect(formatProofLifetime(60)).toBe("1 minute");
    expect(formatProofLifetime(300)).toBe("5 minutes");
    expect(formatProofLifetime(45)).toBe("45 seconds");
    expect(formatProofLifetime(7200)).toBe("2 hours");
  });
});
