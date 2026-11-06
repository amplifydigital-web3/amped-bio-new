/**
 * PR C1 (adult content review 9, AD-D1): the statutory 18+ notices are the spec's
 * text byte for byte. The spec block is the source; the constants are the only
 * copy the apps render.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALABAMA_HEALTH_WARNINGS, SAMHSA_HELPLINE_NOTICE } from "../src/compliance";

const SPEC = join(__dirname, "../../../docs/features/adult-content-review.md");

/** The fenced block under "Health warnings and helpline" in section 9. */
function specBlock(): string[] {
  const text = readFileSync(SPEC, "utf8");
  const start = text.indexOf("ALABAMA HEALTH AND HUMAN SERVICES WARNING");
  const end = text.indexOf("```", start);
  expect(start).toBeGreaterThan(0);
  return text.slice(start, end).replace(/\n+$/, "").split("\n");
}

describe("statutory 18+ notices (C1)", () => {
  it("match the spec text byte for byte", () => {
    const lines = specBlock();
    expect(lines).toEqual([...ALABAMA_HEALTH_WARNINGS, "", ...SAMHSA_HELPLINE_NOTICE]);
    for (const line of [...ALABAMA_HEALTH_WARNINGS, ...SAMHSA_HELPLINE_NOTICE]) {
      expect(
        Buffer.from(line, "utf8").equals(Buffer.from(lines.find(l => l === line)!, "utf8"))
      ).toBe(true);
    }
  });

  it("carry three warnings and the two helpline lines", () => {
    expect(ALABAMA_HEALTH_WARNINGS).toHaveLength(3);
    expect(SAMHSA_HELPLINE_NOTICE).toHaveLength(2);
    expect(SAMHSA_HELPLINE_NOTICE[0]).toContain("1-800-662-HELP (4357)");
  });
});
