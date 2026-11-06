import {
  ENTRANCE_MS,
  ENTRANCE_RISE_PX,
  type AttentionPreset,
  type BlockMotion,
  type BlockSettings,
  type EntranceStyle,
  type ThemeColors,
} from "@repo/constants";

// Block settings motion slots 1 and 2 (spec "Block settings row", Motion).
// Web Animations only: no CSS file, no class that hides content. Every
// animation ends on the block's own resting style, so a block is never left
// invisible, and a browser without element.animate simply shows the block.

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Blocks already in view when the page loads play a shorter entrance. */
export const ENTRANCE_SHORT_MS = 233;

/** The block's motion setting with its defaults: entrance on, theme style. */
export function motionOf(block: { config?: unknown } | null | undefined): Required<BlockMotion> {
  const config = block?.config;
  const motion =
    config && typeof config === "object" ? (config as BlockSettings).motion : undefined;
  return { entrance: motion?.entrance !== false, style: motion?.style ?? "theme" };
}

/**
 * The style an entrance plays. "theme" means Rise for now: it is the theme
 * default until the theme registry carries an entrance of its own.
 */
export function resolveEntrance(style: EntranceStyle): Exclude<EntranceStyle, "theme"> {
  return style === "theme" ? "rise" : style;
}

export function entranceKeyframes(style: EntranceStyle): Keyframe[] {
  switch (resolveEntrance(style)) {
    case "fade":
      return [{ opacity: 0 }, { opacity: 1 }];
    case "scale":
      return [
        { opacity: 0, transform: "scale(0.97)" },
        { opacity: 1, transform: "scale(1)" },
      ];
    default:
      return [
        { opacity: 0, transform: `translateY(${ENTRANCE_RISE_PX}px)` },
        { opacity: 1, transform: "translateY(0)" },
      ];
  }
}

/** Plays the entrance on the frame. Returns null when it cannot run. */
export function playEntrance(
  element: HTMLElement,
  style: EntranceStyle,
  short = false
): Animation | null {
  if (typeof element.animate !== "function") return null;
  try {
    return element.animate(entranceKeyframes(style), {
      duration: short ? ENTRANCE_SHORT_MS : ENTRANCE_MS,
      easing: EASE,
    });
  } catch {
    return null;
  }
}

/** A color at an alpha, for hex colors; other colors go through color-mix. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3 || hex.length === 4
      ? hex
          .slice(0, 3)
          .split("")
          .map(c => c + c)
          .join("")
      : hex.slice(0, 6);
  if (/^[0-9a-f]{6}$/i.test(full)) {
    const n = Number.parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/** The element a preset plays on: the block's first link or button, else the frame. */
export function attentionTarget(frame: HTMLElement): HTMLElement {
  return frame.querySelector<HTMLElement>("a, button") ?? frame;
}

/** Durations per preset, each under 1 second. */
export const ATTENTION_MS: Record<Exclude<AttentionPreset, "off">, number> = {
  shimmer: 900,
  glow: 900,
  pulse: 700,
  edge: 960,
  pop: 520,
};

/**
 * An overlay laid exactly over the target, inside the frame (which is
 * relative). It is aria-hidden, takes no pointer events and is removed when
 * its animation ends or is cancelled.
 */
function overlayOver(frame: HTMLElement, target: HTMLElement, inset: number): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.setAttribute("aria-hidden", "true");
  overlay.setAttribute("data-attention-overlay", "");
  const frameBox = frame.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const radius = target === frame ? "13px" : getComputedStyle(target).borderRadius || "0px";
  Object.assign(overlay.style, {
    position: "absolute",
    left: `${box.left - frameBox.left - inset}px`,
    top: `${box.top - frameBox.top - inset}px`,
    width: `${box.width + inset * 2}px`,
    height: `${box.height + inset * 2}px`,
    borderRadius: inset ? `calc(${radius} + ${inset}px)` : radius,
    overflow: "hidden",
    pointerEvents: "none",
    zIndex: "1",
  });
  frame.appendChild(overlay);
  return overlay;
}

function removeWhenDone(animation: Animation, node: Element) {
  const remove = () => node.remove();
  animation.onfinish = remove;
  animation.oncancel = remove;
}

/**
 * Plays one attention preset in the creator's button and text colors.
 * Returns the animations it started (empty when it could not run).
 */
export function playAttention(
  preset: AttentionPreset,
  frame: HTMLElement,
  colors: Pick<ThemeColors, "button" | "text">
): Animation[] {
  if (preset === "off") return [];
  const target = attentionTarget(frame);
  if (typeof target.animate !== "function") return [];
  const duration = ATTENTION_MS[preset];
  try {
    switch (preset) {
      case "shimmer": {
        // A light band sweeps across the button, left to right
        const overlay = overlayOver(frame, target, 0);
        const band = document.createElement("div");
        Object.assign(band.style, {
          position: "absolute",
          inset: "0",
          background: `linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.35) 48%, ${withAlpha(colors.text, 0.35)} 52%, transparent 65%)`,
        });
        overlay.appendChild(band);
        const animation = band.animate(
          [{ transform: "translateX(-100%)" }, { transform: "translateX(100%)" }],
          { duration, easing: EASE }
        );
        removeWhenDone(animation, overlay);
        return [animation];
      }
      case "glow": {
        // A soft ring and halo in the button color, in and out
        const ring = `0 0 0 1px ${withAlpha(colors.text, 0.35)}, 0 0 0 6px ${withAlpha(colors.button, 0.45)}, 0 0 26px ${withAlpha(colors.button, 0.7)}`;
        const animation = target.animate(
          [
            { boxShadow: "0 0 0 0 transparent" },
            { boxShadow: ring, offset: 0.5 },
            { boxShadow: "0 0 0 0 transparent" },
          ],
          { duration, easing: "ease-in-out" }
        );
        return [animation];
      }
      case "pulse":
        return [
          target.animate(
            [
              { transform: "scale(1)" },
              { transform: "scale(1.04)", offset: 0.4 },
              { transform: "scale(1)" },
            ],
            { duration, easing: EASE }
          ),
        ];
      case "pop":
        return [
          target.animate(
            [
              { transform: "translateY(0) scale(1)" },
              { transform: "translateY(-4px) scale(1.03)", offset: 0.4 },
              { transform: "translateY(0) scale(1)" },
            ],
            { duration, easing: EASE }
          ),
        ];
      case "edge": {
        // A light runs once around the border: a rotating conic sweep seen
        // through a 2 px ring mask
        const overlay = overlayOver(frame, target, 2);
        const ringMask = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";
        overlay.style.padding = "2px";
        overlay.style.setProperty("-webkit-mask", ringMask);
        overlay.style.setProperty("-webkit-mask-composite", "xor");
        overlay.style.setProperty("mask", ringMask);
        overlay.style.setProperty("mask-composite", "exclude");
        const sweep = document.createElement("div");
        const box = overlay.getBoundingClientRect();
        const size = Math.ceil(Math.hypot(box.width, box.height)) || 1;
        Object.assign(sweep.style, {
          position: "absolute",
          left: "50%",
          top: "50%",
          width: `${size}px`,
          height: `${size}px`,
          marginLeft: `${-size / 2}px`,
          marginTop: `${-size / 2}px`,
          background: `conic-gradient(from 0deg, transparent 0deg, ${colors.text} 60deg, transparent 130deg)`,
        });
        overlay.appendChild(sweep);
        const animation = sweep.animate(
          [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
          { duration, easing: "linear" }
        );
        removeWhenDone(animation, overlay);
        return [animation];
      }
    }
  } catch {
    frame.querySelectorAll("[data-attention-overlay]").forEach(node => node.remove());
  }
  return [];
}
