import React from 'react';

interface ParticlesBackgroundProps {
  effect: number;
}

export function ParticlesBackground({ effect }: ParticlesBackgroundProps) {
  if (effect === 0) return null;

  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 animate-pulse" />
    </div>
  );
}