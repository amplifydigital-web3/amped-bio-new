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

  it("keeps particle scenes stored by id and passes a missing config through", () => {
    const particles = { particlesEffect: 5, particlesEffectId: "scene.fire" };
    expect(guardThemeShowcase(particles)).toBe(particles);
    expect(guardThemeShowcase(undefined)).toBeUndefined();
  });
});
