"use client";

import { useEffect, useState } from "react";

// The same key as the creator page Pause motion (041 I02), so one choice holds
// across amped.bio
const PAUSE_KEY = "amped.motion.paused";
const PAUSE_EVENT = "amped:motion-paused";

export function readMotionPaused(): boolean {
  try {
    return window.localStorage.getItem(PAUSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMotionPaused(paused: boolean) {
  try {
    if (paused) window.localStorage.setItem(PAUSE_KEY, "1");
    else window.localStorage.removeItem(PAUSE_KEY);
  } catch {
    // Storage can be blocked; the choice still applies for this visit
  }
  document.documentElement.toggleAttribute("data-motion-paused", paused);
  window.dispatchEvent(new CustomEvent(PAUSE_EVENT, { detail: paused }));
}

/** True when the visitor paused motion or asked the system for reduced motion. */
export function useMotionOff(): boolean {
  const [off, setOff] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      const paused = readMotionPaused();
      document.documentElement.toggleAttribute("data-motion-paused", paused);
      setOff(paused || media.matches);
    };
    update();
    media.addEventListener("change", update);
    window.addEventListener(PAUSE_EVENT, update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener(PAUSE_EVENT, update);
    };
  }, []);
  return off;
}

/** Pause motion only (the system setting is reported separately). */
export function usePausedChoice(): [boolean, (paused: boolean) => void] {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    setPaused(readMotionPaused());
    const update = (event: Event) => setPaused(Boolean((event as CustomEvent).detail));
    window.addEventListener(PAUSE_EVENT, update);
    return () => window.removeEventListener(PAUSE_EVENT, update);
  }, []);
  return [paused, setMotionPaused];
}
