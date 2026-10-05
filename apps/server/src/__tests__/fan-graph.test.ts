/**
 * Fan Graph (#22): pure rules that the spec's acceptance criteria rest on.
 * Database paths are covered by the staging walkthrough in the PR.
 */
import fs from "fs";
import path from "path";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  FOLLOWER_COUNT_FLOOR,
  csvCell,
  fanHandleBase,
  decodeRestoreToken,
  encodeRestoreToken,
  publicCount,
} from "../services/follow/rules";
import { isUserIndexable } from "../utils/indexable";

describe("fan handles never come from the email", () => {
  it("builds the base from the display name", () => {
    expect(fanHandleBase("Jordan Ellis")).toBe("jordan-ellis");
    expect(fanHandleBase("  Zoë  O'Neil ")).toBe("zoe-o-neil");
    expect(fanHandleBase("Night_Shift Podcast!!")).toBe("night-shift-podcast");
  });
  it("falls back to fan for empty or symbol-only names", () => {
    expect(fanHandleBase("")).toBe("fan");
    expect(fanHandleBase(null)).toBe("fan");
    expect(fanHandleBase("!!!")).toBe("fan");
  });
  it("stays within the handle alphabet and length", () => {
    const base = fanHandleBase("A very long display name that goes on and on and on");
    expect(base).toMatch(/^[a-z0-9-]+$/);
    expect(base.length).toBeLessThanOrEqual(24);
    expect(base.endsWith("-")).toBe(false);
  });
});

describe("public follower count (decision 9)", () => {
  it("shows New on Amped under the floor", () => {
    expect(publicCount(FOLLOWER_COUNT_FLOOR - 1, true)).toEqual({
      followerCount: null,
      showCount: true,
      newOnAmped: true,
    });
  });
  it("shows the number at the floor and above", () => {
    expect(publicCount(1240, true)).toEqual({
      followerCount: 1240,
      showCount: true,
      newOnAmped: false,
    });
  });
  it("hides everything when the creator hides the count", () => {
    expect(publicCount(1240, false)).toEqual({
      followerCount: null,
      showCount: false,
      newOnAmped: false,
    });
  });
});

describe("restore token for Undo after Remove follower", () => {
  afterEach(() => vi.useRealTimers());
  const row = {
    f: 7,
    c: 3,
    p: true,
    e: false,
    ea: null,
    s: "page",
    k: null,
    t: "2026-10-01T09:41:00.000Z",
    x: Date.now() + 8_000,
  };

  it("round-trips while fresh", () => {
    expect(decodeRestoreToken(encodeRestoreToken(row))).toEqual(row);
  });
  it("is refused after 8 seconds", () => {
    const token = encodeRestoreToken({ ...row, x: Date.now() + 8_000 });
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 9_000);
    expect(decodeRestoreToken(token)).toBeNull();
  });
  it("is refused when tampered", () => {
    const [payload, signature] = encodeRestoreToken(row).split(".");
    const forged = Buffer.from(JSON.stringify({ ...row, c: 99 })).toString("base64url");
    expect(decodeRestoreToken(`${forged}.${signature}`)).toBeNull();
    expect(decodeRestoreToken(`${payload}.x${signature.slice(1)}`)).toBeNull();
    expect(decodeRestoreToken("garbage")).toBeNull();
  });
});

describe("follower CSV cells", () => {
  it("quotes and neutralizes spreadsheet formulas", () => {
    expect(csvCell("Jordan")).toBe('"Jordan"');
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvCell("=HYPERLINK(1)")).toBe('"\'=HYPERLINK(1)"');
    expect(csvCell("@handle")).toBe('"\'@handle"');
  });
});

describe("fan accounts are never indexable", () => {
  const base = {
    handle: "jordan-ellis-4821",
    block: "no",
    email_verified: true,
    description: "Hi",
  };
  it("excludes unpublished pages", () => {
    expect(isUserIndexable({ ...base, page_status: "UNPUBLISHED" }, 3)).toBe(false);
    expect(isUserIndexable({ ...base, page_status: "PUBLISHED" }, 3)).toBe(true);
  });
});

describe("follow surfaces carry no value language (spec 3.8)", () => {
  // User-visible strings only: quoted literals and JSX text, not identifiers
  const files = [
    "../../../landingpage/src/components/follow/FollowControls.tsx",
    "../../../landingpage/src/components/follow/useFollow.ts",
    "../../../landingpage/src/components/auth/FanRegisterForm.tsx",
    "../../../client/src/components/panels/people/PeoplePanel.tsx",
    "../../../client/src/components/panels/explore/components/FollowingTab.tsx",
  ];
  const banned = /\b(earn\w*|rewards?|points?|tokens?|perks?|apy|apr|yield)\b/i;

  for (const file of files) {
    it(path.basename(file), () => {
      const source = fs.readFileSync(path.resolve(__dirname, file), "utf8");
      const strings = [
        ...source.matchAll(/"([^"\n]*)"/g),
        ...source.matchAll(/`([^`]*)`/g),
        ...source.matchAll(/>([^<>{}\n]+)</g),
      ]
        .map(match => match[1])
        // Class names, paths and query keys are not copy
        .filter(text => !/^[\w./@:-]*$/.test(text) || /\s/.test(text))
        .filter(text => !/^(x-captcha-response)$/.test(text));
      const hits = strings.filter(text => banned.test(text));
      expect(hits).toEqual([]);
    });
  }
});
