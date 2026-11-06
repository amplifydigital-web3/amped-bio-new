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
 * Strength (phase 3e, spec 3.5): how far a hover moves. 50 is each hover as
 * shipped, so no saved page changes; 0 is none and 100 is twice as far. The
 * classes read CSS variables whose fallbacks are today's values, and the
 * renderer sets the variables only while the themeShowcase flag is on.
 */
export const HOVER_STRENGTH_PARAM = {
  kind: "range",
  min: 0,
  max: 100,
  step: 1,
  default: 50,
  label: "Strength",
} as const satisfies ParamSpec;

/** Strength as a factor: 1 at the default 50. */
export function hoverStrengthFactor(
  params: Readonly<Record<string, number | string>> = {}
): number {
  const raw = params["strength"];
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : 50;
  return Math.min(100, Math.max(0, value)) / 50;
}

const round = (value: number) => Number(value.toFixed(3));

/**
 * The CSS variables a hover's Strength sets, by hover id. A hover with no
 * entry here has no Strength. Scale and Pop grow, Slide moves, Glow spreads,
 * Rotate turns, and Lift and tilt leans and rises.
 */
export function hoverStrengthVars(
  id: string,
  params: Readonly<Record<string, number | string>> = {}
): Record<string, string> {
  const f = hoverStrengthFactor(params);
  switch (id) {
    case "buttonHover.scale":
      return { "--amped-hover-scale": String(round(1 + 0.05 * f)) };
    case "buttonHover.pop":
      return { "--amped-hover-scale": String(round(1 + 0.1 * f)) };
    case "buttonHover.slide":
      return { "--amped-hover-x": `${round(8 * f)}px` };
    case "buttonHover.glow":
      return { "--amped-hover-glow": `${round(15 * f)}px` };
    case "buttonHover.rotate":
      return { "--amped-hover-rot": `${round(3 * f)}deg` };
    case "buttonHover.lift-tilt":
      return {
        "--amped-hover-tilt": `${round(8 * f)}deg`,
        "--amped-hover-lift": `${round(-3 * f)}px`,
      };
    default:
      return {};
  }
}

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

const STRENGTH_PARAMS = { speed: HOVER_SPEED_PARAM, strength: HOVER_STRENGTH_PARAM };

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
    "motion-safe:hover:scale-[var(--amped-hover-scale,1.05)] motion-safe:focus-visible:scale-[var(--amped-hover-scale,1.05)] transition-transform duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]",
    { params: STRENGTH_PARAMS }
  ),
  hover(
    "glow",
    "Glow",
    "A glow in your button color",
    2,
    "hover:shadow-[0_0_var(--amped-hover-glow,15px)_var(--amped-glow)] focus-visible:shadow-[0_0_var(--amped-hover-glow,15px)_var(--amped-glow)] transition-shadow duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]",
    { params: STRENGTH_PARAMS }
  ),
  hover(
    "slide",
    "Slide",
    "Slides to the right",
    3,
    "motion-safe:hover:translate-x-[var(--amped-hover-x,0.5rem)] motion-safe:focus-visible:translate-x-[var(--amped-hover-x,0.5rem)] transition-transform duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]",
    { params: STRENGTH_PARAMS }
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
    "motion-safe:hover:rotate-[var(--amped-hover-rot,3deg)] motion-safe:focus-visible:rotate-[var(--amped-hover-rot,3deg)] transition-transform duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]",
    { params: STRENGTH_PARAMS }
  ),
  hover(
    "pop",
    "Pop",
    "Grows on hover, presses in on tap",
    8,
    "motion-safe:hover:scale-[var(--amped-hover-scale,1.1)] motion-safe:focus-visible:scale-[var(--amped-hover-scale,1.1)] motion-safe:active:scale-95 transition-transform duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)]",
    { params: STRENGTH_PARAMS }
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
  ...PLUS_HOVERS(),
];

/**
 * Phase 3e (spec 3.5, board 09): the Plus hovers, behind themeShowcase. A
 * renderer without the flag draws the nearest v1 look the editor stored in
 * buttonEffect. All three are pointer only, like every hover.
 * - Magnet: the button leans toward the pointer, up to 8 px and 2 deg at the
 *   default Strength, and settles back in 377 ms (packages/ui hover-motion.ts).
 * - Lift and tilt: perspective(377px) rotateX(8deg) translateY(-3px) in 233 ms.
 * - Jelly: scale(1.12, 0.9) to scale(0.96, 1.04) to scale(1) over 377 ms.
 */
function PLUS_HOVERS(): EffectEntry[] {
  const plus = (
    id: string,
    label: string,
    description: string,
    engine: EffectEntry["engine"],
    render: EffectEntry["render"]
  ): EffectEntry => ({
    ...hover(id, label, description, undefined, "x"),
    tier: "plus",
    engine,
    pointer: "fine",
    params: STRENGTH_PARAMS,
    render,
    addedIn: 2,
  });
  return [
    plus("magnet", "Magnet", "The button leans toward the pointer", "waapi", {
      kind: "waapi",
      trigger: "hover",
      keyframes: () => [],
      options: () => ({ duration: 377, easing: "cubic-bezier(0.2,0,0,1)" }),
    }),
    plus("lift-tilt", "Lift and tilt", "The button lifts and leans back", "css", {
      kind: "class",
      className:
        "transition-transform duration-[233ms] ease-[cubic-bezier(0.2,0,0,1)] motion-safe:hover:[transform:perspective(377px)_rotateX(var(--amped-hover-tilt,8deg))_translateY(var(--amped-hover-lift,-3px))] motion-safe:focus-visible:[transform:perspective(377px)_rotateX(var(--amped-hover-tilt,8deg))_translateY(var(--amped-hover-lift,-3px))]",
    }),
    plus("jelly", "Jelly", "The button wobbles like jelly", "waapi", {
      kind: "waapi",
      trigger: "hover",
      keyframes: p => {
        const f = hoverStrengthFactor(p);
        return [
          { transform: "scale(1, 1)" },
          { transform: `scale(${round(1 + 0.12 * f)}, ${round(1 - 0.1 * f)})` },
          { transform: `scale(${round(1 - 0.04 * f)}, ${round(1 + 0.04 * f)})` },
          { transform: "scale(1, 1)" },
        ];
      },
      options: () => ({ duration: 377, easing: "cubic-bezier(0.2,0,0,1)" }),
    }),
  ];
}
