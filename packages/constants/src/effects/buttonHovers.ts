import type { EffectEntry } from "./types";

/**
 * Button hover effects. The v1 buttonEffect values 0 to 9 as the public page
 * renders them after Screen Review 041 I07: one shot over 233ms on hover or
 * keyboard focus, transform, opacity or shadow only. The editor's infinite
 * bounce and pulse were a drift bug; the shared renderer (1b) draws these.
 * Literal class strings so Tailwind can see them.
 */

const hover = (
  id: string,
  label: string,
  description: string,
  legacyId: number,
  className: string
): EffectEntry => ({
  id: `buttonHover.${id}`,
  layer: "buttonHover",
  label,
  description,
  tier: "core",
  engine: "css",
  cost: className ? "light" : "still",
  source: "amped",
  colorMode: "theme",
  params: {},
  render: className ? { kind: "class", className } : { kind: "none" },
  preview: { sample: "button" },
  legacyId,
  addedIn: 1,
});

export const BUTTON_HOVER_EFFECTS: readonly EffectEntry[] = [
  hover("none", "None", "No hover effect", 0, ""),
  hover(
    "scale",
    "Scale",
    "Grows a little",
    1,
    "motion-safe:hover:scale-105 motion-safe:focus-visible:scale-105 transition-transform duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]"
  ),
  hover(
    "glow",
    "Glow",
    "A glow in your button color",
    2,
    "hover:shadow-[0_0_15px_var(--amped-glow)] focus-visible:shadow-[0_0_15px_var(--amped-glow)] transition-shadow duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]"
  ),
  hover(
    "slide",
    "Slide",
    "Slides to the right",
    3,
    "motion-safe:hover:translate-x-2 motion-safe:focus-visible:translate-x-2 transition-transform duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]"
  ),
  hover(
    "bounce",
    "Bounce",
    "One quick bounce",
    4,
    "motion-safe:hover:animate-[bounce_233ms_cubic-bezier(0.2,0,0,1)_1] motion-safe:focus-visible:animate-[bounce_233ms_cubic-bezier(0.2,0,0,1)_1]"
  ),
  hover(
    "pulse",
    "Pulse",
    "One quick pulse",
    5,
    "motion-safe:hover:animate-[pulse_233ms_cubic-bezier(0.2,0,0,1)_1] motion-safe:focus-visible:animate-[pulse_233ms_cubic-bezier(0.2,0,0,1)_1]"
  ),
  hover(
    "shake",
    "Shake",
    "One quick shake",
    6,
    "motion-safe:hover:animate-[wiggle_233ms_cubic-bezier(0.2,0,0,1)_1] motion-safe:focus-visible:animate-[wiggle_233ms_cubic-bezier(0.2,0,0,1)_1]"
  ),
  hover(
    "rotate",
    "Rotate",
    "Tilts a little",
    7,
    "motion-safe:hover:rotate-3 motion-safe:focus-visible:rotate-3 transition-transform duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]"
  ),
  hover(
    "pop",
    "Pop",
    "Grows on hover, presses in on tap",
    8,
    "motion-safe:hover:scale-110 motion-safe:focus-visible:scale-110 motion-safe:active:scale-95 transition-transform duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]"
  ),
  hover(
    "shine",
    "Shine",
    "A light sweep across the button",
    9,
    "hover:before:opacity-100 focus-visible:before:opacity-100 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:opacity-0 before:transition-opacity overflow-hidden relative duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]"
  ),
];
