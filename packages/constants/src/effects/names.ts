import type { EffectEntry } from "./types";

/**
 * Name effects. The v1 heroEffect values as the public page renders them
 * after Screen Review 041 I06. 1, 3, 4 and 5 are not offered in the editor
 * today and stay retired until phase 2 rebuilds them: Gradient on the theme
 * colors, a fixed Typewriter, and the Blur in and Split reveal entrances that
 * replace 4 and 5 (they render as Fade in and Slide up until then, as today).
 * Looping effects carry settledClassName, the Pause motion look.
 */

const name = (
  id: string,
  label: string,
  description: string,
  legacyId: number | undefined,
  className: string,
  extra: Partial<EffectEntry> = {}
): EffectEntry => ({
  id: `name.${id}`,
  layer: "name",
  label,
  description,
  tier: "core",
  engine: "css",
  cost: className ? "light" : "still",
  source: "amped",
  colorMode: "theme",
  params: {},
  render: className ? { kind: "class", className } : { kind: "none" },
  preview: { sample: "name" },
  ...(legacyId === undefined ? {} : { legacyId }),
  addedIn: 1,
  ...extra,
});

export const NAME_EFFECTS: readonly EffectEntry[] = [
  name("none", "None", "No effect on your name", 0, ""),
  name(
    "gradient",
    "Gradient",
    "A moving blue to purple gradient",
    1,
    "bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500 motion-safe:animate-gradient",
    {
      colorMode: "fixed",
      loop: true,
      retired: true,
      render: {
        kind: "class",
        className:
          "bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500 motion-safe:animate-gradient",
        settledClassName:
          "bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-500",
      },
    }
  ),
  name(
    "glow",
    "Glow",
    "A soft glow in your text color",
    2,
    "drop-shadow-[0_0_10px_var(--amped-name-glow)]",
    {
      cost: "still",
    }
  ),
  name(
    "typewriter",
    "Typewriter",
    "Fades in once",
    3,
    "motion-safe:animate-[fadeIn_610ms_cubic-bezier(0.2,0,0,1)_both]",
    {
      retired: true,
    }
  ),
  name(
    "blur-in",
    "Fade in",
    "Fades in once",
    4,
    "motion-safe:animate-[fadeIn_610ms_cubic-bezier(0.2,0,0,1)_both]",
    {
      retired: true,
    }
  ),
  name(
    "split-reveal",
    "Slide up",
    "Slides up once",
    5,
    "motion-safe:animate-[slideUp_610ms_cubic-bezier(0.2,0,0,1)_both]",
    { retired: true }
  ),
  name("wave", "Wave", "Your name moves in a wave", 6, "motion-safe:animate-wave", {
    loop: true,
    render: { kind: "class", className: "motion-safe:animate-wave", settledClassName: "" },
  }),
  name("neon", "Neon", "Neon light", 7, "text-[#ff00ff] drop-shadow-[0_0_10px_#ff00ff]", {
    colorMode: "fixed",
    cost: "still",
  }),
  name("rainbow", "Rainbow", "Cycles through rainbow colors", 8, "motion-safe:animate-rainbow", {
    colorMode: "fixed",
    loop: true,
    render: { kind: "class", className: "motion-safe:animate-rainbow", settledClassName: "" },
  }),
  name("glitch", "Glitch", "A glitch flicker", 9, "motion-safe:animate-glitch", {
    loop: true,
    render: { kind: "class", className: "motion-safe:animate-glitch", settledClassName: "" },
  }),
  ...NEW_NAME_EFFECTS(),
];

/**
 * Phase 2 (board 08, spec 3.5): the core name effects new in v2. They have no
 * v1 integer and are stored by id. The retired Gradient, Typewriter, Fade in
 * and Slide up entries above keep rendering what v1 renders for the pages
 * that carry 1, 3, 4 or 5, so the rebuilt looks take new ids.
 *
 * Text fills use -webkit-text-fill-color, because the page sets the creator's
 * text color inline and an inline color would beat a text-transparent class.
 * Gradients use background-image and its longhands: the background shorthand
 * resets background-clip and would paint a box instead of the text. Outline
 * and Shadow stack scale in em, so they suit the 26 px name and the 16 px bio.
 * Colors read the theme variables (--amped-font, --amped-btn).
 */
function NEW_NAME_EFFECTS(): EffectEntry[] {
  const v2 = (
    id: string,
    label: string,
    description: string,
    render: EffectEntry["render"],
    extra: Partial<EffectEntry> = {}
  ): EffectEntry => ({
    ...name(id, label, description, undefined, ""),
    render,
    cost: "light",
    addedIn: 2,
    ...extra,
  });
  const ease = "cubic-bezier(0.2,0,0,1)";
  return [
    // A sheen in a lighter tint of the text color crosses the name in 2.6 s;
    // at rest the sheen sits off the right edge, so the name reads plain
    v2(
      "shiny",
      "Shiny",
      "A sheen sweeps across your name",
      {
        kind: "class",
        className:
          "[background-image:linear-gradient(110deg,var(--amped-font)_42%,color-mix(in_srgb,var(--amped-font)_30%,#fff)_50%,var(--amped-font)_58%)] bg-[length:250%_100%] bg-left-top bg-clip-text [-webkit-text-fill-color:transparent] motion-safe:animate-amped-shiny",
        settledClassName:
          "[background-image:linear-gradient(110deg,var(--amped-font)_42%,color-mix(in_srgb,var(--amped-font)_30%,#fff)_50%,var(--amped-font)_58%)] bg-[length:250%_100%] bg-left-top bg-clip-text [-webkit-text-fill-color:transparent]",
      },
      { loop: true }
    ),
    // The theme gradient: button color to text color and back, sweeping
    v2(
      "gradient-sweep",
      "Gradient",
      "Your colors flow across your name",
      {
        kind: "class",
        className:
          "[background-image:linear-gradient(90deg,var(--amped-btn),var(--amped-font),var(--amped-btn))] bg-[length:200%_100%] bg-left bg-clip-text [-webkit-text-fill-color:transparent] motion-safe:animate-gradient",
        settledClassName:
          "[background-image:linear-gradient(90deg,var(--amped-btn),var(--amped-font),var(--amped-btn))] bg-[length:200%_100%] bg-left bg-clip-text [-webkit-text-fill-color:transparent]",
      },
      { loop: true }
    ),
    v2(
      "outline",
      "Outline",
      "Your name drawn as an outline",
      {
        kind: "class",
        className:
          "[-webkit-text-fill-color:transparent] [-webkit-text-stroke:0.06em_var(--amped-font)]",
      },
      { cost: "still" }
    ),
    v2(
      "chrome",
      "Chrome",
      "A polished metal finish",
      {
        kind: "class",
        className:
          "[background-image:linear-gradient(180deg,#fafafa_0%,#c8c8c8_40%,#6b6b6b_52%,#a8a8a8_70%,#f0f0f0_100%)] bg-clip-text [-webkit-text-fill-color:transparent] drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]",
      },
      { cost: "still", colorMode: "fixed" }
    ),
    // Five stacked steps in a darker shade of the text color
    v2(
      "shadow-stack",
      "Shadow stack",
      "Stacked shadows give your name depth",
      {
        kind: "class",
        className:
          "[text-shadow:0.04em_0.04em_0_color-mix(in_srgb,var(--amped-font)_55%,#000),0.08em_0.08em_0_color-mix(in_srgb,var(--amped-font)_50%,#000),0.12em_0.12em_0_color-mix(in_srgb,var(--amped-font)_45%,#000),0.16em_0.16em_0_color-mix(in_srgb,var(--amped-font)_40%,#000),0.2em_0.2em_0_color-mix(in_srgb,var(--amped-font)_35%,#000)]",
      },
      { cost: "still" }
    ),
    // Entrances: once per visit, 610 ms, never delay the text (spec 3.5)
    v2(
      "focus-in",
      "Blur in",
      "Your name comes into focus once",
      {
        kind: "waapi",
        trigger: "mount",
        text: "whole",
        keyframes: () => [
          { opacity: 0, filter: "blur(8px)" },
          { opacity: 1, filter: "blur(0px)" },
        ],
        options: () => ({ duration: 610, easing: ease, fill: "both" }),
      },
      { engine: "waapi" }
    ),
    v2(
      "letter-rise",
      "Split reveal",
      "Letters rise into place once",
      {
        kind: "waapi",
        trigger: "mount",
        text: "letters",
        stagger: 34,
        keyframes: () => [
          { opacity: 0, transform: "translateY(0.4em)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        options: () => ({ duration: 377, easing: ease, fill: "both" }),
      },
      { engine: "waapi" }
    ),
    v2(
      "type-on",
      "Typewriter",
      "Letters type out once",
      {
        kind: "waapi",
        trigger: "mount",
        text: "letters",
        stagger: 55,
        keyframes: () => [{ opacity: 0 }, { opacity: 1 }],
        options: () => ({ duration: 1, easing: "linear", fill: "both" }),
      },
      { engine: "waapi" }
    ),
    v2(
      "decrypt",
      "Decrypt",
      "Scrambled letters settle into your name once",
      {
        kind: "waapi",
        trigger: "mount",
        text: "scramble",
        keyframes: () => [],
        options: () => ({ duration: 610 }),
      },
      { engine: "waapi" }
    ),
  ];
}

/**
 * Settle for a looping name effect (board 08): the stored choice, else the
 * entry's default. v1 loops keep looping, so no saved page changes; the new
 * loops play once when the page opens, as the board shows for Shiny.
 */
export function nameSettle(entry: EffectEntry, stored?: "once" | "always"): "once" | "always" {
  return stored ?? (entry.addedIn === 2 ? "once" : "always");
}

/** True for the text entrances (Blur in, Split reveal, Typewriter, Decrypt). */
export function isNameEntrance(entry: EffectEntry): boolean {
  return entry.render.kind === "waapi" && entry.render.text !== undefined;
}
