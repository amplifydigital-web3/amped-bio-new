/** Path, range and header helpers (spec 3.4 and 3.6). */
import { describe, it, expect } from "vitest";
import { pathForKey, servedKeyFromPath } from "../src/path";
import { parseRange, resolveRange } from "../src/range";
import { contentDisposition, safeContentType } from "../src/headers";

describe("served keys", () => {
  it("accepts the served prefixes with a content public id", () => {
    expect(servedKeyFromPath("/audio/abcdefghijklmnop/full.m4a")).toEqual({
      key: "audio/abcdefghijklmnop/full.m4a",
      publicId: "abcdefghijklmnop",
    });
    expect(servedKeyFromPath("/derived/abcdefghijklmnop/COVER/640")?.key).toBe(
      "derived/abcdefghijklmnop/COVER/640"
    );
  });

  it("refuses unscanned, quarantined and unknown prefixes", () => {
    for (const path of [
      "/incoming/abcdefghijklmnop/original.pdf",
      "/quarantine/abcdefghijklmnop/original.zip",
      "/profiles/abcdefghijklmnop/a.png",
      "/originals/ABCDEFGHIJKLMNOP/original.pdf",
      "/originals/abcdefghijklmnop",
      "/",
    ]) {
      expect(servedKeyFromPath(path)).toBeNull();
    }
  });

  it("refuses encoded slashes, dot segments, empty segments and control characters", () => {
    for (const path of [
      "/originals/abcdefghijklmnop/a%2F..%2Fb.pdf",
      "/originals/abcdefghijklmnop/%2E%2E",
      "/originals/abcdefghijklmnop//a.pdf",
      "/originals/abcdefghijklmnop/a%00.pdf",
      "/originals/abcdefghijklmnop/a%5Cb.pdf",
      "/originals/abcdefghijklmnop/%E0%A4%A",
    ]) {
      expect(servedKeyFromPath(path)).toBeNull();
    }
  });

  it("round trips keys with spaces and UTF-8 the way the API encodes them", () => {
    const key = "originals/abcdefghijklmnop/Studio notes é.pdf";
    expect(servedKeyFromPath(new URL(`https://m.test${pathForKey(key)}`).pathname)?.key).toBe(key);
  });
});

describe("ranges", () => {
  it("parses one range and ignores the rest", () => {
    expect(parseRange("bytes=0-99")).toEqual({ offset: 0, length: 100 });
    expect(parseRange("bytes=100-")).toEqual({ offset: 100 });
    expect(parseRange("bytes=-500")).toEqual({ suffix: 500 });
    for (const value of [
      null,
      "",
      "bytes=0-1,4-5",
      "items=0-1",
      "bytes=5-1",
      "bytes=-0",
      "bytes=-",
    ]) {
      expect(parseRange(value)).toBeNull();
    }
  });

  it("resolves against the size, clamping the end and refusing a start past it", () => {
    expect(resolveRange({ offset: 0, length: 100 }, 50)).toEqual({ offset: 0, length: 50 });
    expect(resolveRange({ suffix: 500 }, 200)).toEqual({ offset: 0, length: 200 });
    expect(resolveRange({ offset: 200 }, 200)).toBeNull();
    expect(resolveRange({ offset: 0 }, 0)).toBeNull();
  });
});

describe("headers", () => {
  it("serves only listed content types", () => {
    expect(safeContentType("audio/mp4")).toBe("audio/mp4");
    expect(safeContentType("Application/PDF; charset=binary")).toBe("application/pdf");
    for (const value of [
      "text/html",
      "image/svg+xml",
      "application/javascript",
      "text/xml",
      undefined,
    ]) {
      expect(safeContentType(value)).toBe("application/octet-stream");
    }
  });

  it("writes a safe attachment header with a UTF-8 name", () => {
    expect(contentDisposition('Studio "notes" é/a.pdf', "originals/x/original.pdf")).toBe(
      "attachment; filename=\"Studio _notes_ __a.pdf\"; filename*=UTF-8''Studio%20_notes_%20%C3%A9_a.pdf"
    );
    expect(contentDisposition(undefined, "originals/x/original.pdf")).toBe(
      "attachment; filename=\"original.pdf\"; filename*=UTF-8''original.pdf"
    );
  });
});
