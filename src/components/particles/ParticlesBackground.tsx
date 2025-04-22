import Particles from "@tsparticles/react";
import { particleConfigs } from "./particleConfigs";

interface ParticlesBackgroundProps {
  effect: number;
}

export function ParticlesBackground({ effect }: ParticlesBackgroundProps) {
  if (effect === 0) return null;

  const config = particleConfigs[effect as keyof typeof particleConfigs];
  if (!config) return null;

  return (
    <Particles
      id="tsparticles"
      options={{
        ...config,
        fullScreen: {
          enable: false,
          zIndex: 0,
        },
        fpsLimit: 120,
        detectRetina: true,
      }}
      className="absolute inset-0"
    />
  );
}
