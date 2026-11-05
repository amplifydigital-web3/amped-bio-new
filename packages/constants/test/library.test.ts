// Fan Library API shapes (Build Board #26, FL-2): access source precedence,
// the input schemas and the still theme summary.
import { describe, expect, it } from "vitest";
import {
  LIBRARY_ACCESS_SOURCES,
  libraryCreatorItemsSchema,
  libraryNewestSchema,
  librarySearchSchema,
  libraryThemeSummary,
  pickAccessSource,
} from "../src";

describe("access source precedence (spec 2.1, decision 12)", () => {
  it("ranks Purchased over Members over Pool fans over Followers over Public", () => {
    expect(LIBRARY_ACCESS_SOURCES).toEqual(["purchased", "member", "pool", "follower", "public"]);
    expect(pickAccessSource(["public", "member", "follower"])).toBe("member");
    expect(pickAccessSource(["member", "purchased"])).toBe("purchased");
    expect(pickAccessSource(["public"])).toBe("public");
    expect(pickAccessSource([])).toBeNull();
  });
});

describe("library inputs", () => {
  it("normalizes handles and defaults the segment", () => {
    expect(libraryCreatorItemsSchema.parse({ handle: "@Maya_Lin" })).toEqual({
      handle: "maya_lin",
      seg: "yours",
    });
  });

  it("needs a creator for creator scoped search and two characters to search", () => {
    expect(librarySearchSchema.safeParse({ q: "tide", scope: "creator" }).success).toBe(false);
    expect(librarySearchSchema.safeParse({ q: "t" }).success).toBe(false);
    expect(
      librarySearchSchema.parse({ q: " tide ", scope: "creator", handle: "maya" })
    ).toMatchObject({ q: "tide", scope: "creator", handle: "maya" });
  });

  it("caps the On this device id list", () => {
    const ids = Array.from({ length: 501 }, (_, i) => `a${String(i).padStart(15, "0")}`);
    expect(libraryNewestSchema.safeParse({ where: "device", deviceIds: ids }).success).toBe(false);
    expect(libraryNewestSchema.parse(undefined)).toBeUndefined();
  });
});

describe("theme summary (spec 3.2)", () => {
  it("keeps colors, fonts and a still background from a v1 config", () => {
    const summary = libraryThemeSummary({ buttonColor: "#5650A2", fontFamily: "Outfit" } as never);
    expect(summary).toMatchObject({ button: "#5650a2", nameFont: "Outfit", bodyFont: "Outfit" });
    expect(summary?.background?.type === "color" || summary?.background?.type === "gradient").toBe(
      true
    );
  });

  it("gives null for no config and for a malformed v2 config", () => {
    expect(libraryThemeSummary(null)).toBeNull();
    expect(libraryThemeSummary({ version: 2 } as never)).toBeNull();
  });
});
