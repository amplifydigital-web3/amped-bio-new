// Frame watchdog and the weak device check, shared by the landing hero and,
// from phase 3, the creator page effect engines. Extracted unchanged from
// apps/landingpage/src/components/landing/motion/HeroBeam.tsx (motion layer
// #26, merged in #291) in Theme Engine v2 phase 1b (spec 3.7).

/** Weak devices keep the poster: Save-Data, under 4 cores or under 4 GB memory. */
export function lowPower(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  return (
    Boolean(nav.connection?.saveData) ||
    (nav.hardwareConcurrency || 8) < 4 ||
    (nav.deviceMemory || 8) < 4
  );
}

export interface FrameWatchdog {
  /**
   * Call once per animation frame with its timestamp. Returns false when the
   * device proved too slow: the caller stops and keeps its still version.
   */
  sample: (now: number) => boolean;
  /** Call when frames stop (hidden tab, off screen) so the gap is not measured. */
  pause: () => void;
}

/**
 * The median of the first `frames` visible frames over `budgetMs` means the
 * device is too slow (defaults: 45 frames, 28 ms). Measures once; after the
 * first window it always returns true.
 */
export function createFrameWatchdog({
  frames: windowSize = 45,
  budgetMs = 28,
  onSlow,
}: {
  frames?: number;
  budgetMs?: number;
  onSlow: () => void;
}): FrameWatchdog {
  const deltas: number[] = [];
  let last = 0;
  return {
    sample(now) {
      if (deltas.length >= windowSize) return true;
      if (last) deltas.push(now - last);
      last = now;
      if (deltas.length === windowSize) {
        const median = [...deltas].sort((a, b) => a - b)[Math.floor((windowSize - 1) / 2)]!;
        if (median > budgetMs) {
          onSlow();
          return false;
        }
      }
      return true;
    },
    pause() {
      last = 0;
    },
  };
}
