import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { usePrefersReducedMotion } from "@repo/ui";
import { particleConfigs } from "./particleConfigs";

interface ParticlesBackgroundProps {
  effect: number;
  /** Unique id when more than one instance renders at once (Design tiles) */
  id?: string;
  className?: string;
  /** still: one frame, no motion (Design tiles at rest, 029 I02) */
  mode?: "live" | "still";
}

// The particle engine and its effect presets load on first use, not at editor
// start, so screens without particles never download them (Build Board #26).
let engineReady: Promise<void> | null = null;
function ensureParticlesEngine() {
  engineReady ??= initParticlesEngine(async engine => {
    const { loadAll } = await import("@tsparticles/all");
    await loadAll(engine);
  });
  return engineReady;
}

// Screen Review 029 I03: particles pause when the page or frame is hidden, and
// visitors who ask for reduced motion see one still frame with no pointer effects.
export function ParticlesBackground({
  effect,
  id = "tsparticles",
  className = "absolute inset-0",
  mode = "live",
}: ParticlesBackgroundProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (effect === 0) return;
    let active = true;
    void ensureParticlesEngine().then(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [effect]);

  if (effect === 0 || !ready) return null;

  const config = particleConfigs[effect as keyof typeof particleConfigs];
  if (!config) return null;

  const still =
    reducedMotion || mode === "still"
      ? {
          particles: { ...config.particles, move: { ...config.particles?.move, enable: false } },
          interactivity: { events: { onHover: { enable: false }, onClick: { enable: false } } },
        }
      : {};

  return (
    <Particles
      id={id}
      options={{
        ...config,
        ...still,
        fullScreen: {
          enable: false,
          zIndex: 0,
        },
        fpsLimit: mode === "still" ? 1 : 120,
        detectRetina: true,
        pauseOnBlur: true,
        pauseOnOutsideViewport: true,
      }}
      className={className}
    />
  );
}
