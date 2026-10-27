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
  publicFollowerHandle,
} from "../services/follow/rules";
import { isUserIndexable } from "../utils/indexable";
import {
  FACES_MIN,
  cumulativeSeries,
  dayIndex,
  numbersVisible,
  publicFaces,
  publicGrowth,
  publicMilestone,
  publicPoolFans,
  publicSources,
} from "../services/follow/blockRules";
import { blockCarriesFollow, type BlockType } from "@repo/constants";

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

describe("public follower lists never link to an unpublished page (QA-008)", () => {
  it("shows the handle only for a published page", () => {
    expect(publicFollowerHandle({ handle: "jordan", page_status: "PUBLISHED" })).toBe("jordan");
    expect(
      publicFollowerHandle({ handle: "jordan-ellis-4821", page_status: "UNPUBLISHED" })
    ).toBeNull();
    expect(publicFollowerHandle({ handle: null, page_status: "PUBLISHED" })).toBeNull();
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
    // QA-008: fan page publish
    "../../../client/src/components/panels/home/MakeYourPageCard.tsx",
    "../../../client/src/components/shell/PublishPageSheet.tsx",
    "../../../client/src/components/shell/pageVisibility.ts",
    "../../../client/src/components/shell/PublishFirstHint.tsx",
    "../../../client/src/components/panels/account/PageVisibilityRow.tsx",
    // Build Board #30: Follow block and Followers block
    "../../../landingpage/src/components/blocks/FollowBlock.tsx",
    "../../../landingpage/src/components/blocks/FollowersBlock.tsx",
    "../../../client/src/components/blocks/FollowBlock.tsx",
    "../../../client/src/components/blocks/FollowersBlock.tsx",
    "../../../client/src/components/panels/page/blocks/FollowBlockFields.tsx",
    "../../../client/src/components/panels/page/blocks/blockInfo.ts",
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

// ===== Follow block and Followers block (Build Board #30) =====

describe("Followers block never shows a number the capsule would not (3.3)", () => {
  it("hides every number under the floor", () => {
    const visible = numbersVisible(FOLLOWER_COUNT_FLOOR - 1, true);
    expect(visible).toBe(false);
    expect(publicGrowth(4, visible)).toBeNull();
    expect(cumulativeSeries(9, [1, 2, 3], visible)).toBeNull();
    expect(publicMilestone(9, visible)).toBeNull();
    expect(publicSources([{ source: "page", count: 9 }], visible)).toBeNull();
    expect(publicPoolFans(3, 9, true, visible)).toBeNull();
  });
  it("hides every number while the creator hides the count", () => {
    const visible = numbersVisible(1240, false);
    expect(visible).toBe(false);
    expect(publicGrowth(48, visible)).toBeNull();
    expect(cumulativeSeries(1240, [], visible)).toBeNull();
    expect(publicMilestone(1240, visible)).toBeNull();
    expect(publicSources([{ source: "page", count: 1240 }], visible)).toBeNull();
    expect(publicPoolFans(412, 1240, true, visible)).toBeNull();
  });
  it("shows numbers at the floor with the count on", () => {
    expect(numbersVisible(FOLLOWER_COUNT_FLOOR, true)).toBe(true);
  });
});

describe("growth never goes negative on the public page (decision 5)", () => {
  it("shows a delta only when the period added followers", () => {
    expect(publicGrowth(48, true)).toBe(48);
    expect(publicGrowth(0, true)).toBeNull();
    expect(publicGrowth(-3, true)).toBeNull();
  });
  it("draws a cumulative series that ends at the count and never falls", () => {
    const perDay = new Array(30).fill(0);
    perDay[29] = 5;
    perDay[20] = 7;
    const series = cumulativeSeries(100, perDay, true)!;
    expect(series).toHaveLength(30);
    expect(series[29]).toBe(100);
    expect(series[28]).toBe(95);
    expect(series[20]).toBe(95);
    expect(series[19]).toBe(88);
    for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
  });
  it("floors the series at zero after unfollows", () => {
    // 20 follows in the window but only 12 remain: the start clamps at 0
    const perDay = new Array(30).fill(0);
    perDay[29] = 20;
    const series = cumulativeSeries(12, perDay, true)!;
    expect(series[28]).toBe(0);
    expect(series[29]).toBe(12);
  });
  it("maps timestamps to a day in the 30 day window", () => {
    const now = new Date("2026-10-08T15:00:00Z");
    expect(dayIndex(new Date("2026-10-08T01:00:00Z"), now)).toBe(29);
    expect(dayIndex(new Date("2026-09-09T23:00:00Z"), now)).toBe(0);
    expect(dayIndex(new Date("2026-09-08T23:00:00Z"), now)).toBeNull();
  });
});

describe("faces come only from opted-in followers, three or none (decision 6)", () => {
  const face = (poolFan = false) => ({ poolFan });
  it("hides the row under three", () => {
    expect(publicFaces([face(), face()], "newest", 6)).toEqual([]);
    expect(FACES_MIN).toBe(3);
  });
  it("caps at the configured size", () => {
    expect(publicFaces(new Array(20).fill(face()), "newest", 6)).toHaveLength(6);
    expect(publicFaces(new Array(20).fill(face()), "newest", 12)).toHaveLength(12);
  });
  it("puts pool fans first, keeping newest order inside each group", () => {
    const rows = [
      { id: 1, poolFan: false },
      { id: 2, poolFan: true },
      { id: 3, poolFan: false },
      { id: 4, poolFan: true },
    ];
    expect(publicFaces(rows, "poolFans", 6).map(r => r.id)).toEqual([2, 4, 1, 3]);
  });
});

describe("sources show kinds, never campaigns (decisions 7 and 8)", () => {
  it("folds block into page, drops small kinds and keeps three", () => {
    const sources = publicSources(
      [
        { source: "page", count: 50 },
        { source: "block", count: 30 },
        { source: "explore", count: 12 },
        { source: "qr", count: 6 },
        { source: "pool", count: 1 },
        { source: "broadcast", count: 1 },
      ],
      true
    )!;
    expect(sources.map(s => s.kind)).toEqual(["page", "explore", "qr"]);
    expect(sources[0].share).toBe(0.8);
    expect(sources.some(s => (s.kind as string).includes("ampaign"))).toBe(false);
  });
  it("returns an empty list with no counted follows", () => {
    expect(publicSources([], true)).toEqual([]);
  });
});

describe("milestones and pool fans", () => {
  it("returns the highest milestone reached", () => {
    expect(publicMilestone(99, true)).toBeNull();
    expect(publicMilestone(100, true)).toBe(100);
    expect(publicMilestone(4_999, true)).toBe(1_000);
    expect(publicMilestone(250_000, true)).toBe(100_000);
  });
  it("needs a pool, visible numbers and at least one fan", () => {
    expect(publicPoolFans(412, 1240, false, true)).toBeNull();
    expect(publicPoolFans(0, 1240, true, true)).toBeNull();
    expect(publicPoolFans(412, 1240, true, true)).toEqual({ poolFans: 412, poolFanShare: 0.33 });
  });
});

describe("capsule rule: one Follow on screen (spec 3.8)", () => {
  const block = (type: string, config: Record<string, unknown>) =>
    ({ id: 1, type, order: 0, config }) as BlockType;
  it("a Follow block carries Follow", () => {
    expect(blockCarriesFollow(block("follow", { label: "Follow" }))).toBe(true);
  });
  it("a hidden Follow block does not", () => {
    expect(blockCarriesFollow(block("follow", { label: "Follow", hidden: true }))).toBe(false);
  });
  it("a Followers card carries Follow only with its button on", () => {
    expect(blockCarriesFollow(block("followers", { title: "Followers", followButton: true }))).toBe(
      true
    );
    expect(
      blockCarriesFollow(block("followers", { title: "Followers", followButton: false }))
    ).toBe(false);
  });
  it("other blocks never do", () => {
    expect(blockCarriesFollow(block("link", { url: "https://x.com" }))).toBe(false);
  });
});
