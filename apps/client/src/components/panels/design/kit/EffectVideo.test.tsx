import { existsSync, statSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { ALL_EFFECTS } from "@repo/constants";
import videos from "./effectVideos.json";
import { EffectVideo, effectVideoSrc } from "./EffectVideo";

// Theme Engine v2 phase 3g (decision 12): build time tile videos.

const PUBLIC = path.resolve(__dirname, "../../../../../public");

describe("tile videos", () => {
  it("has a committed video for every renderable entry that asks for one, and only those", () => {
    // The generator records WebGL and canvas entries. Particle tiles (Particle
    // text, Comet trails) keep preview.video but fall back to their live or
    // still frame until the renderer can record them.
    const wanted = ALL_EFFECTS.filter(
      e =>
        e.preview.video &&
        !e.retired &&
        (e.render.kind === "webgl" || e.render.kind === "canvas")
    ).map(e => e.id);
    expect(Object.keys(videos).sort()).toEqual([...wanted].sort());
  });

  it("keeps each file on disk, in the manifest's size, under 100 KB", () => {
    for (const [id, item] of Object.entries(videos)) {
      const file = path.join(PUBLIC, item.src);
      expect(existsSync(file), id).toBe(true);
      expect(statSync(file).size).toBe(item.bytes);
      expect(item.bytes).toBeLessThan(100 * 1024);
    }
  });

  it("loads nothing until the tile plays, and stays muted and inline", () => {
    const { container, rerender } = render(<EffectVideo id="scene.aurora" playing={false} />);
    const video = container.querySelector("video")!;
    expect(video).toHaveAttribute("preload", "none");
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("playsinline");
    expect(video.getAttribute("src")).toBeNull();
    expect(video.style.opacity).toBe("0");
    rerender(<EffectVideo id="scene.aurora" playing />);
    expect(video.getAttribute("src")).toBe(effectVideoSrc("scene.aurora"));
    expect(video.style.opacity).toBe("1");
  });

  it("reports a video that will not load, so the tile falls back to its live effect", () => {
    const onUnavailable = vi.fn();
    const { container } = render(
      <EffectVideo id="cursor.splash" playing onUnavailable={onUnavailable} />
    );
    fireEvent.error(container.querySelector("video")!);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders nothing for an entry with no video", () => {
    const { container } = render(<EffectVideo id="scene.fire" playing />);
    expect(container.querySelector("video")).toBeNull();
  });
});
