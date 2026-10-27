"use client";

// Screen Review 041 I03: the particles engine no longer loads on every public
// page. ParticlesBackground starts it on demand, after first paint, only when a
// page uses particles. This wrapper stays so the root layout is unchanged.
export function ParticlesProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
