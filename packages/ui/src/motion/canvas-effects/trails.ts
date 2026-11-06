import type { CanvasEffect, CanvasEffectFactory } from "../canvas";
import { effectColor, rgba } from "../canvas";

// Cursor trails (spec 3.5, Cursor row): Spark trail, Pixel trail and Dot
// trail. Length is 8 to 34 points; each point fades over its life, so a still
// pointer leaves nothing behind and the loop sleeps.

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

function trail(kind: "spark" | "pixel" | "dot"): CanvasEffectFactory {
  return (params, colors): CanvasEffect => {
    const color = effectColor(params, colors.button);
    const length = Math.round(Math.min(34, Math.max(8, Number(params["length"]) || 21)));
    const points: Point[] = [];
    let lastX = NaN;
    let lastY = NaN;
    return {
      frame({ ctx, pointer, dt }) {
        if (pointer.inside && (pointer.x !== lastX || pointer.y !== lastY)) {
          const dx = Number.isNaN(lastX) ? 0 : pointer.x - lastX;
          const dy = Number.isNaN(lastY) ? 0 : pointer.y - lastY;
          lastX = pointer.x;
          lastY = pointer.y;
          const spread = kind === "spark" ? 60 : 0;
          points.push({
            x: pointer.x,
            y: pointer.y,
            vx: -dx * 2 + (Math.random() - 0.5) * spread,
            vy: -dy * 2 + (Math.random() - 0.5) * spread,
            life: 1,
          });
          while (points.length > length) points.shift();
        } else if (!pointer.inside) {
          lastX = NaN;
          lastY = NaN;
        }
        const decay = dt / (0.018 * length);
        for (const p of points) {
          p.life -= decay;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        while (points.length && points[0]!.life <= 0) points.shift();
        points.forEach((p, i) => {
          const a = Math.max(0, p.life);
          if (kind === "spark") {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = rgba(color, a);
            ctx.stroke();
          } else if (kind === "pixel") {
            const s = 8;
            ctx.fillStyle = rgba(color, a * 0.8);
            ctx.fillRect(Math.floor(p.x / s) * s, Math.floor(p.y / s) * s, s, s);
          } else {
            const r = 2 + 6 * a * ((i + 1) / points.length);
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fillStyle = rgba(color, a * 0.7);
            ctx.fill();
          }
        });
        return points.length > 0;
      },
    };
  };
}

export const sparkTrail = trail("spark");
export const pixelTrail = trail("pixel");
export const dotTrail = trail("dot");
