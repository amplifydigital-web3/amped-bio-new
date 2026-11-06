import { describe, expect, it } from "vitest";
import { SHARE_COPY, shareUrl, shareUsesLine } from "./shareLook";

// TE-4b, Share this look (board 12).
describe("share dialog helpers", () => {
  it("builds amped.bio/t/<slug> from the public site address", () => {
    expect(shareUrl("abcdefgh", "https://amped.bio")).toBe("https://amped.bio/t/abcdefgh");
    expect(shareUrl("abcdefgh", "https://amped.bio/")).toBe("https://amped.bio/t/abcdefgh");
  });

  it("reads the usage line", () => {
    expect(shareUsesLine(0)).toBe("No one has used this look yet.");
    expect(shareUsesLine(1)).toBe("Used once.");
    expect(shareUsesLine(42)).toBe("Used 42 times.");
  });

  it("keeps the dialog copy free of dashes and reward words", () => {
    for (const line of Object.values(SHARE_COPY)) {
      expect(line).not.toMatch(/[–—]| - /);
      expect(line.toLowerCase()).not.toMatch(/reward|earn|referral|token/);
    }
  });
});
