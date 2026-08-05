"use client";

import { useEffect } from "react";
import { initParticlesEngine } from "@tsparticles/react";
import { loadAll } from "@tsparticles/all";

export function ParticlesProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initParticlesEngine(async engine => {
      await loadAll(engine);
    });
  }, []);

  return <>{children}</>;
}
