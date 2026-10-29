import type { EffectEntry, ParamSpec } from "./types";

/**
 * Speed (editor chrome, spec 3.5): Default keeps each hover's own timing, so
 * no saved page changes; Fast and Slow set the transition to 144 or 377 ms.
 */
export const HOVER_SPEED_PARAM = {
  kind: "choice",
  options: ["default", "fast", "slow"],
  default: "default",
  label: "Speed",
} as const satisfies ParamSpec;

export const HOVER_SPEED_MS: Readonly<Record<string, number>> = { fast: 144, slow: 377 };

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
  legacyId: number | undefined,
  className: string,
  extra: Partial<EffectEntry> = {}
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
  params: className ? { speed: HOVER_SPEED_PARAM } : {},
  render: className ? { kind: "class", className } : { kind: "none" },
  preview: { sample: "button" },
  ...(legacyId === undefined ? {} : { legacyId }),
  addedIn: 1,
  ...extra,
});

// Phase 2 (board 09) adds core hovers with no v1 integer at the end. The editor
// stores their id as buttonEffectId and keeps buttonEffect on the nearest v1
// look. Their colors come from currentColor (the creator's text color), so the
// label keeps its contrast.
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
  hover(
    "fill-sweep",
    "Fill sweep",
    "A tint in your text color sweeps across",
    undefined,
    "relative isolate overflow-hidden before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:bg-[color-mix(in_srgb,currentColor_14%,transparent)] before:transition-transform before:duration-[233ms] before:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:before:transition-none hover:before:scale-x-100 focus-visible:before:scale-x-100",
    { addedIn: 2 }
  ),
  hover(
    "underline-grow",
    "Underline grow",
    "An underline grows under the label",
    undefined,
    "relative before:absolute before:inset-x-[21px] before:bottom-[6px] before:h-[2px] before:origin-left before:scale-x-0 before:bg-current before:transition-transform before:duration-[233ms] before:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:before:transition-none hover:before:scale-x-100 focus-visible:before:scale-x-100",
    { addedIn: 2 }
  ),
  hover(
    "border-draw",
    "Border draw",
    "A border in your text color draws in",
    undefined,
    "ring-inset ring-[color:color-mix(in_srgb,currentColor_60%,transparent)] transition-shadow duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)] hover:ring-2 focus-visible:ring-2",
    { addedIn: 2 }
  ),
  hover(
    "icon-slide",
    "Icon slide",
    "The icon slides toward the label",
    undefined,
    "[&>span:first-child]:transition-transform [&>span:first-child]:duration-[233ms] [&>span:first-child]:ease-[cubic-bezier(0.2,0,0,1)] motion-safe:[&:hover>span:first-child]:translate-x-[5px] motion-safe:[&:focus-visible>span:first-child]:translate-x-[5px]",
    { addedIn: 2 }
  ),
  hover(
    "arrow-nudge",
    "Arrow nudge",
    "The arrow nudges right; pairs with the Split layout",
    undefined,
    "[&>svg]:transition-transform [&>svg]:duration-[233ms] [&>svg]:ease-[cubic-bezier(0.2,0,0,1)] motion-safe:[&:hover>svg]:translate-x-[5px] motion-safe:[&:focus-visible>svg]:translate-x-[5px]",
    { addedIn: 2 }
  ),
];
