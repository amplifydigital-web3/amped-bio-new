import type { CanvasEffect, CanvasEffectFactory } from "../canvas";
import { effectColor, rgba } from "../canvas";

// Cursor Glow and Ring (spec 3.5, Cursor row): one shape follows the pointer
// with a lerp (Glow 0.15, 144 px radial; Ring 0.2, 34 px ring) and fades in
// and out with the pointer. Never replaces the system cursor.

function follow(kind: "glow" | "ring"): CanvasEffectFactory {
  return (params, colors): CanvasEffect => {
    const color = effectColor(params, colors.button);
    const lerp = kind === "glow" ? 0.15 : 0.2;
    let x = -999;
    let y = -999;
    let alpha = 0;
    return {
      frame({ ctx, pointer }) {
        if (x === -999) {
          x = pointer.x;
          y = pointer.y;
        }
        x += (pointer.x - x) * lerp;
        y += (pointer.y - y) * lerp;
        alpha += ((pointer.inside ? 1 : 0) - alpha) * 0.12;
        if (alpha > 0.01) {
          if (kind === "glow") {
            const g = ctx.createRadialGradient(x, y, 0, x, y, 144);
            g.addColorStop(0, rgba(color, 0.35 * alpha));
            g.addColorStop(1, rgba(color, 0));
            ctx.fillStyle = g;
            ctx.fillRect(x - 144, y - 144, 288, 288);
          } else {
            ctx.beginPath();
            ctx.arc(x, y, 17, 0, Math.PI * 2);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = rgba(color, 0.8 * alpha);
            ctx.stroke();
          }
        }
        const moving = Math.abs(pointer.x - x) + Math.abs(pointer.y - y) > 0.3;
        const fading = Math.abs((pointer.inside ? 1 : 0) - alpha) > 0.01;
        return moving || fading;
      },
    };
  };
}

export const glow = follow("glow");
export const ring = follow("ring");
