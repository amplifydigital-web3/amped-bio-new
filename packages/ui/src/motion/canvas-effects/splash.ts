import type { CanvasEffect, CanvasEffectFactory } from "../canvas";
import { effectColor, rgba } from "../canvas";

// Cursor Splash (spec 3.5): ink blooms where the pointer moves, carried by
// the pointer's speed, then spread and fade. The heaviest cursor entry: up to
// 160 additive blooms. Phase 3c draws it on the 2D canvas engine.

interface Bloom {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  hue: 0 | 1;
}

export const splash: CanvasEffectFactory = (params, colors): CanvasEffect => {
  const a = effectColor(params, colors.button);
  const b = colors.text;
  const blooms: Bloom[] = [];
  let lastX = NaN;
  let lastY = NaN;
  return {
    frame({ ctx, pointer, dt }) {
      if (pointer.inside && !Number.isNaN(lastX)) {
        const dx = pointer.x - lastX;
        const dy = pointer.y - lastY;
        const speed = Math.hypot(dx, dy);
        const count = Math.min(4, Math.floor(speed / 6));
        for (let i = 0; i < count; i++) {
          blooms.push({
            x: pointer.x - (dx * i) / Math.max(1, count),
            y: pointer.y - (dy * i) / Math.max(1, count),
            vx: dx * 6 + (Math.random() - 0.5) * 40,
            vy: dy * 6 + (Math.random() - 0.5) * 40,
            r: 6 + Math.random() * 10,
            life: 1,
            hue: Math.random() < 0.7 ? 0 : 1,
          });
        }
        while (blooms.length > 160) blooms.shift();
      }
      lastX = pointer.inside ? pointer.x : NaN;
      lastY = pointer.inside ? pointer.y : NaN;
      ctx.globalCompositeOperation = "lighter";
      for (const p of blooms) {
        p.life -= dt * 0.9;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.r += dt * 60;
        if (p.life <= 0) continue;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, rgba(p.hue ? b : a, 0.22 * p.life));
        g.addColorStop(1, rgba(p.hue ? b : a, 0));
        ctx.fillStyle = g;
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      ctx.globalCompositeOperation = "source-over";
      for (let i = blooms.length - 1; i >= 0; i--) if (blooms[i]!.life <= 0) blooms.splice(i, 1);
      return blooms.length > 0;
    },
  };
};
