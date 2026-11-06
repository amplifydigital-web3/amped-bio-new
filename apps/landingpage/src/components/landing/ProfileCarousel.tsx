"use client";

import { useCallback, useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useMotionOff } from "./motion/motionState";
import { CAROUSEL_SLIDES } from "./profileCarouselSlides";

// Example creator pages in the hero phone frame. Replaces the coded Night Shift
// demo with real 390x661 page screens that rotate. The screens are creator
// content, so the frame adds no Prism color over them.
//
// Motion rules:
// - Auto-advance every ROTATE_MS. Crossfade between screens.
// - Holds on the current screen while hovered, while a control has focus,
//   while the tab is hidden, and when the visitor presses Pause.
// - Pause motion (amped.motion.paused) or prefers-reduced-motion: no
//   auto-advance and no fade. The dots still work.
//
// Loading: the first screen loads eagerly. Each later screen mounts one step
// ahead of when it is shown, so the hero never pulls all 14 images up front.

const ROTATE_MS = 4000;

export function ProfileCarousel() {
  const motionOff = useMotionOff();
  const [index, setIndex] = useState(0);
  // Highest screen index allowed to mount (current plus one ahead)
  const [loadedUpTo, setLoadedUpTo] = useState(1);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);

  const count = CAROUSEL_SLIDES.length;
  const rotating = !motionOff && !userPaused;
  const holding = hovered || focused || hidden;

  const goTo = useCallback(
    (next: number) => {
      const target = (next + count) % count;
      setIndex(target);
      setLoadedUpTo(prev => Math.max(prev, Math.min(target + 1, count - 1)));
    },
    [count]
  );

  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!rotating || holding) return;
    const timer = window.setTimeout(() => goTo(index + 1), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, holding, index, goTo]);

  const current = CAROUSEL_SLIDES[index];

  return (
    <figure className="flex flex-col items-center gap-[13px]">
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Example Amped.bio pages"
        className="flex w-full flex-col items-center gap-[13px]"
        onPointerEnter={event => event.pointerType === "mouse" && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <div
          aria-live={rotating ? "off" : "polite"}
          className="relative aspect-[390/661] w-full max-w-[390px] select-none overflow-hidden rounded-[21px] bg-[#14161C]"
        >
          {CAROUSEL_SLIDES.map((slide, i) => {
            if (i > loadedUpTo && i !== index) return null;
            const active = i === index;
            return (
              // Plain img: local static files in /public (next/image localPatterns only allow /og)
              <img
                key={slide.file}
                src={`/carousel/${slide.file}.webp`}
                alt={active ? `Example Amped.bio page: ${slide.name}` : ""}
                aria-hidden={active ? undefined : true}
                width={390}
                height={661}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "low"}
                decoding="async"
                draggable={false}
                className={`absolute inset-0 h-full w-full object-cover ${
                  motionOff ? "" : "transition-opacity duration-700 ease-out"
                } ${active ? "opacity-100" : "opacity-0"}`}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            onClick={() => setUserPaused(p => !p)}
            aria-label={userPaused ? "Play example pages" : "Pause example pages"}
            aria-pressed={userPaused}
            disabled={motionOff && !userPaused}
            className="flex h-[24px] w-[24px] items-center justify-center rounded-full text-prism-ink-2 hover:text-prism-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            {userPaused || motionOff ? (
              <Play className="h-[13px] w-[13px]" aria-hidden />
            ) : (
              <Pause className="h-[13px] w-[13px]" aria-hidden />
            )}
          </button>
          <div className="flex items-center" role="group" aria-label="Choose an example page">
            {CAROUSEL_SLIDES.map((slide, i) => (
              <button
                key={slide.file}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show ${slide.name}`}
                aria-current={i === index ? "true" : undefined}
                className="group flex h-[24px] w-[16px] items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
              >
                <span
                  aria-hidden
                  className={`block h-[5px] rounded-full transition-all ${
                    i === index
                      ? "w-[13px] bg-prism-ink"
                      : "w-[5px] bg-prism-ink-2/40 group-hover:bg-prism-ink-2"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="font-prism text-prism-meta text-prism-ink-2">
        Example page · {current.name}
      </figcaption>
    </figure>
  );
}
