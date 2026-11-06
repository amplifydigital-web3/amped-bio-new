import type { CanvasEffect, CanvasEffectFactory } from "../canvas";
import { effectColor, rgba } from "../canvas";

// Button press Click spark (spec 3.5): 8 lines burst from the press point in
// 233 ms. Draws on one shared page canvas, so a press never delays the link.

const LINES = 8;
const DURATION = 0.233;

export const clickSpark: CanvasEffectFactory = (params, colors): CanvasEffect => {
  const color = effectColor(params, colors.button);
  const bursts: { x: number; y: number; t: number }[] = [];
  return {
    press(x, y) {
      bursts.push({ x, y, t: 0 });
    },
    frame({ ctx, dt }) {
      for (const burst of bursts) {
        burst.t += dt;
        const k = Math.min(1, burst.t / DURATION);
        const ease = 1 - (1 - k) * (1 - k);
        for (let i = 0; i < LINES; i++) {
          const angle = (i / LINES) * Math.PI * 2;
          const r0 = 6 + ease * 14;
          const r1 = r0 + 10 * (1 - k);
          ctx.beginPath();
          ctx.moveTo(burst.x + Math.cos(angle) * r0, burst.y + Math.sin(angle) * r0);
          ctx.lineTo(burst.x + Math.cos(angle) * r1, burst.y + Math.sin(angle) * r1);
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.strokeStyle = rgba(color, 1 - k);
          ctx.stroke();
        }
      }
      for (let i = bursts.length - 1; i >= 0; i--)
        if (bursts[i]!.t >= DURATION) bursts.splice(i, 1);
      return bursts.length > 0;
    },
  };
};
