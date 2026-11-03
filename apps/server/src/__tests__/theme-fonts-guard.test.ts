import { beforeEach, describe, expect, it, vi } from "vitest";

// Theme Engine v2 phase 2b, fonts PR 1 (spec 3.8): the API stores catalog
// faces only while the fontCatalog flag is on (AGENTS.md, flags rule 3).

vi.mock("@repo/database", () => ({ prisma: {}, Prisma: {} }));

import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import { guardThemeFonts } from "../services/themeFonts";

const CONFIG = {
  fontFamily: "Figtree",
  fontColor: "#16152b",
  nameFont: { family: "Fraunces", weight: 800 },
  bodyFontStyle: { weight: 500 },
};

beforeEach(() => __setFeatureFlagOverridesForTests({}));

describe("guardThemeFonts", () => {
  it("drops the name face and body style while fontCatalog is off", () => {
    expect(guardThemeFonts(CONFIG)).toEqual({ fontFamily: "Figtree", fontColor: "#16152b" });
  });

  it("keeps them while fontCatalog is on", () => {
    __setFeatureFlagOverridesForTests({ fontCatalog: true });
    expect(guardThemeFonts(CONFIG)).toEqual(CONFIG);
  });

  it("passes a missing config through", () => {
    expect(guardThemeFonts(undefined)).toBeUndefined();
  });
});
