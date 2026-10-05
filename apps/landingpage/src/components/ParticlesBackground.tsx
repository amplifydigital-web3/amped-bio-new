"use client";

import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import type { ISourceOptions } from "@tsparticles/engine";
import { usePrefersReducedMotion } from "@repo/ui";
import { particleConfigs } from "@/lib/particleConfigs";

interface ParticlesBackgroundProps {
  effect: number;
  /** Pause motion (Screen Review 041 I02): render one still frame */
  paused?: boolean;
  /** Unique id when more than one instance renders at once */
  id?: string;
  className?: string;
}

// Matrix (6) is retired: saved pages render no particles (041 I06)
const RETIRED = new Set([6]);

// One engine per page, started only when a page uses particles (041 I03)
let engineReady: Promise<void> | null = null;
function startEngine() {
  if (!engineReady) {
    engineReady = initParticlesEngine(async engine => {
      // Loaded on demand, so pages without particles never download the bundle
      const { loadAll } = await import("@tsparticles/all");
      await loadAll(engine);
    });
  }
  return engineReady;
}

function afterFirstPaint(run: () => void) {
  const idle = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (idle) idle(run, { timeout: 1000 });
  else setTimeout(run, 200);
}

// Screen Review 029 I03 and 041 I01, I03, I04: particles start after first
// paint, cap at 60 fps, pause when the tab is hidden or the canvas is off
// screen, never spawn on click, react to hover only for fine pointers, and
// stay still under reduced motion or Pause motion. The canvas never takes taps.
export function ParticlesBackground({
  effect,
  paused = false,
  id = "tsparticles",
  className = "absolute inset-0",
}: ParticlesBackgroundProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);
  const config = RETIRED.has(effect) ? undefined : particleConfigs[effect];

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    afterFirstPaint(() => {
      void startEngine().then(() => {
        if (!cancelled) setReady(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [config]);

  if (!config || !ready) return null;

  const still = reducedMotion || paused;
  const finePointer = typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
  const events = config.interactivity?.events;
  const options: ISourceOptions = {
    ...config,
    particles: {
      ...config.particles,
      move: { ...config.particles?.move, enable: still ? false : config.particles?.move?.enable },
    },
    interactivity: {
      ...config.interactivity,
      detectsOn: "window",
      events: {
        ...events,
        onClick: { enable: false },
        onHover: !still && finePointer && events?.onHover ? events.onHover : { enable: false },
      },
    },
    fullScreen: { enable: false, zIndex: 0 },
    fpsLimit: 60,
    detectRetina: true,
    pauseOnBlur: true,
    pauseOnOutsideViewport: true,
  };

  return (
    <Particles
      // Remount on pause so the frame stops where it is
      key={still ? "still" : "moving"}
      id={id}
      options={options}
      className={`pointer-events-none ${className}`}
    />
  );
}
