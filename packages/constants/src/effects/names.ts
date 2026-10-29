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
  legacyId: number,
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
  legacyId,
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
];
