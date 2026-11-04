import { beforeEach, describe, expect, it, vi } from "vitest";

// Theme Engine v2 phase 3b (spec 3.5): the API stores shader scenes only
// while the themeShowcase flag is on (AGENTS.md, flags rule 3).

vi.mock("@repo/database", () => ({ prisma: {}, Prisma: {} }));

import { __setFeatureFlagOverridesForTests } from "../services/featureFlags";
import { guardThemeShowcase } from "../services/themeShowcase";

const SHADER = {
  fontFamily: "Inter",
  particlesEffect: 0,
  particlesEffectId: "scene.aurora",
  particlesParams: { intensity: 80 },
};

beforeEach(() => __setFeatureFlagOverridesForTests({}));

describe("guardThemeShowcase", () => {
  it("drops a shader scene and its params while themeShowcase is off", () => {
    expect(guardThemeShowcase(SHADER)).toEqual({ fontFamily: "Inter", particlesEffect: 0 });
  });

  it("keeps it while themeShowcase is on", () => {
    __setFeatureFlagOverridesForTests({ themeShowcase: true });
    expect(guardThemeShowcase(SHADER)).toEqual(SHADER);
  });

  it("drops the cursor, a canvas name effect and Click spark while themeShowcase is off", () => {
    const config = {
      fontFamily: "Inter",
      cursorEffectId: "cursor.glow",
      cursorParams: { palette: "theme" },
      heroEffect: 0,
      heroEffectId: "name.fuzzy",
      heroEffectParams: { strength: 40 },
      buttonPressId: "buttonPress.click-spark",
    };
    expect(guardThemeShowcase(config)).toEqual({ fontFamily: "Inter", heroEffect: 0 });
    __setFeatureFlagOverridesForTests({ themeShowcase: true });
    expect(guardThemeShowcase(config)).toEqual(config);
  });

  it("keeps core and Plus picks on the other engines", () => {
    const config = { heroEffectId: "name.shiny", buttonPressId: "buttonPress.ripple" };
    expect(guardThemeShowcase(config)).toBe(config);
  });

  it("keeps particle scenes stored by id and passes a missing config through", () => {
    const particles = { particlesEffect: 5, particlesEffectId: "scene.fire" };
    expect(guardThemeShowcase(particles)).toBe(particles);
    expect(guardThemeShowcase(undefined)).toBeUndefined();
  });
});
