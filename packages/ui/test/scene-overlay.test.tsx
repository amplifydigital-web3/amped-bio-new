import { renderToStaticMarkup } from "react-dom/server";
import type { ThemeConfig } from "@repo/constants";
import { CreatorPage } from "../src/creator/creator-page";
import { hasLoopingMotion, lookFor, overlayParticlesId, playingOverlay } from "../src/creator/look";

// Theme Engine v2 phase 2, Scene core (board 01): the page plays a scene stored by id.

const PROFILE = { name: "Maya Rivera" };

describe("stored scenes on the page", () => {
  it("plays a scene stored by id", () => {
    const look = lookFor({ particlesEffect: 5, particlesEffectId: "scene.fire" });
    expect(playingOverlay(look)?.id).toBe("scene.fire");
    expect(hasLoopingMotion(look)).toBe(true);
    // The v1 hook still gets the v1 number only
    expect(overlayParticlesId(look)).toBe(0);
  });

  it("keeps v1 overlays and the retired Matrix as before", () => {
    expect(playingOverlay(lookFor({ particlesEffect: 3 }))?.id).toBe("scene.snow");
    expect(playingOverlay(lookFor({ particlesEffect: 6 }))).toBeNull();
    expect(playingOverlay(lookFor({ particlesEffect: 0 }))).toBeNull();
    expect(hasLoopingMotion(lookFor({ particlesEffect: 6 }))).toBe(false);
  });

  it("keeps the v1 contract of renderOverlay", () => {
    const overlays: number[] = [];
    const theme: ThemeConfig = { particlesEffect: 5, particlesEffectId: "scene.hearts" };
    renderToStaticMarkup(
      <CreatorPage
        theme={theme}
        mode="public"
        profile={PROFILE}
        renderOverlay={id => {
          overlays.push(id);
          return null;
        }}
      />
    );
    expect(overlays).toEqual([0]);
  });
});
