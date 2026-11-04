import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@repo/ui";
import videos from "./effectVideos.json";

// Theme Engine v2 phase 3g (decision 12, spec 3.10): heavy tiles play a 2 s
// build time video instead of opening a WebGL context per tile. The video is
// muted and inline, loads nothing until the tile first plays, plays only while
// the tile is hovered, focused or tapped, and never under reduced motion. The
// files come from scripts/effects/render-thumbnails.ts.

const MANIFEST = videos as Readonly<Record<string, { src: string; bytes: number }>>;

/** The tile video for an effect id, or undefined when the entry has none. */
export function effectVideoSrc(id: string): string | undefined {
  return MANIFEST[id]?.src;
}

export function EffectVideo({ id, playing }: { id: string; playing: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const src = effectVideoSrc(id);
  const play = playing && !reducedMotion;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (play) {
      if (!video.src) video.src = src ?? "";
      // Older browsers return no promise from play()
      const started = video.play() as Promise<void> | undefined;
      started?.catch(() => {});
    } else {
      video.pause();
    }
  }, [play, src]);

  if (!src) return null;
  return (
    <video
      ref={ref}
      aria-hidden
      muted
      loop
      playsInline
      preload="none"
      data-effect-video={id}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-[233ms]"
      style={{ opacity: play ? 1 : 0 }}
    />
  );
}
