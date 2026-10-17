import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findBannedTerms } from "@repo/constants";
import { CONTENT_COPY } from "./copy";
import { failureLine } from "./lib/status";

// Spec 3.11 adds these to the shared list for content and store surfaces
const CONTENT_EXTRA = ["return", "income", "gains", "share anything", "100% safe"];
// En and em dash, built from code points so this file holds neither character
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

/** Every string in the copy module, calling each template with sample values. */
function collect(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (typeof value === "function") {
    const fn = value as (...args: unknown[]) => unknown;
    for (const args of [
      ["Shoreline.jpg", 3, 12],
      [3, 12, true],
      [0, 140],
    ]) {
      collect(fn(...args), out);
    }
  } else if (Array.isArray(value)) value.forEach(v => collect(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach(v => collect(v, out));
  return out;
}

const REASONS = [
  "size_mismatch",
  "type_mismatch",
  "upload_expired",
  "source_missing",
  "pdf_encrypted",
  "archive_encrypted",
  "archive_ratio",
  "archive_too_large",
  "archive_corrupt",
  "epub_entry_too_large",
  "image_too_large",
  "audio_too_long",
  "document_unsupported",
  "scan_limits",
  "pdf_unreadable",
  "stream:ERR",
  "unknown",
];

describe("content copy (spec 3.11, acceptance 22)", () => {
  const strings = [...collect(CONTENT_COPY), ...REASONS.map(failureLine)];

  it("has copy to check", () => {
    expect(strings.length).toBeGreaterThan(100);
  });

  it("uses no banned terms", () => {
    const hits = strings.flatMap(text =>
      findBannedTerms(text).map(hit => `${hit.phrase} in "${text}"`)
    );
    const extra = strings.flatMap(text =>
      CONTENT_EXTRA.filter(term =>
        new RegExp(`(?<![\\p{L}])${term}(?![\\p{L}])`, "iu").test(text)
      ).map(term => `${term} in "${text}"`)
    );
    expect([...hits, ...extra]).toEqual([]);
  });

  it("uses no em or en dashes", () => {
    expect(strings.filter(text => DASHES.test(text))).toEqual([]);
  });

  it("states the scan without promising safety", () => {
    expect(CONTENT_COPY.upload.rightsBody).toContain("scanned before it goes live");
    expect(strings.some(text => /\bsafe\b/i.test(text))).toBe(false);
  });

  it("keeps dashes out of the component sources too", () => {
    const dir = __dirname;
    const files: string[] = [];
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = join(d, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) files.push(path);
      }
    };
    walk(dir);
    const offenders = files.filter(path => DASHES.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
