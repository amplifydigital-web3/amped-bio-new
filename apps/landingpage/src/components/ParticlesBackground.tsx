import Particles from "@tsparticles/react";
import { usePrefersReducedMotion } from "@repo/ui";
import { particleConfigs } from "@/lib/particleConfigs";

interface ParticlesBackgroundProps {
  effect: number;
  /** Unique id when more than one instance renders at once (Design tiles) */
  id?: string;
  className?: string;
}

// Screen Review 029 I03: particles pause when the page or frame is hidden, and
// visitors who ask for reduced motion see one still frame with no pointer effects.
export function ParticlesBackground({
  effect,
  id = "tsparticles",
  className = "absolute inset-0",
}: ParticlesBackgroundProps) {
  const reducedMotion = usePrefersReducedMotion();
  if (effect === 0) return null;

  const config = particleConfigs[effect as keyof typeof particleConfigs];
  if (!config) return null;

  const still = reducedMotion
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
        fpsLimit: 120,
        detectRetina: true,
        pauseOnBlur: true,
        pauseOnOutsideViewport: true,
      }}
      className={className}
    />
  );
}
