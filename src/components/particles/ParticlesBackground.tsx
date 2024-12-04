import { useCallback } from 'react';
import Particles from 'react-particles';
import type { Engine } from 'tsparticles-engine';
import { loadSlim } from 'tsparticles-slim';
import { particleConfigs } from './particleConfigs';

interface ParticlesBackgroundProps {
  effect: number;
}

export function ParticlesBackground({ effect }: ParticlesBackgroundProps) {
  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine);
  }, []);

  if (effect === 0) return null;

  const config = particleConfigs[effect as keyof typeof particleConfigs];
  if (!config) return null;

  return (
    <Particles
      id="tsparticles"
      init={particlesInit}
      options={{
        ...config,
        fullScreen: {
          enable: false,
          zIndex: 0
        },
        background: {
          color: {
            value: 'transparent',
          },
        },
        fpsLimit: 120,
        detectRetina: true,
      }}
      className="absolute inset-0 -z-10"
    />
  );
}