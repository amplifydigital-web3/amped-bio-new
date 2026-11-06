import { describe, expect, it } from "vitest";
import { atHandle, dayLabel, linkParts, rowTime } from "./util";

describe("inbox util", () => {
  it("splits links and leaves sentence ends out", () => {
    expect(linkParts("See https://amped.bio/maya. Thanks")).toEqual([
      { text: "See " },
      { text: "https://amped.bio/maya", href: "https://amped.bio/maya" },
      { text: ". Thanks" },
    ]);
    expect(linkParts("no links here")).toEqual([{ text: "no links here" }]);
  });

  it("labels today and yesterday", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    expect(dayLabel(now)).toBe("Today");
    expect(dayLabel(yesterday)).toBe("Yesterday");
    expect(rowTime(yesterday)).toBe("Yesterday");
  });

  it("names a person by handle, or says the account was deleted", () => {
    expect(atHandle({ name: "Maya", handle: "maya" })).toBe("@maya");
    expect(atHandle(null)).toBe("This account was deleted.");
  });
});
