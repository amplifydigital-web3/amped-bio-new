import { describe, expect, it } from "vitest";
import { shareTargets } from "./shareTargets";

describe("shareTargets", () => {
  const link = "https://amped.bio/register?r=0x2f";

  it("encodes the invite link into every target", () => {
    const targets = shareTargets(link);
    expect(targets.map(target => target.id)).toEqual(["x", "telegram", "whatsapp", "email"]);
    for (const target of targets) {
      expect(target.href).toContain(encodeURIComponent(link));
    }
  });

  it("labels every icon-only target", () => {
    for (const target of shareTargets(link)) {
      expect(target.label.length).toBeGreaterThan(0);
    }
  });
});
