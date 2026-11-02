import type { EffectEntry } from "./types";

/**
 * Button surfaces. The v1 buttonStyle values 0 to 9, class for class as the
 * public page renders them (getButtonBaseStyle in both apps is identical).
 * Labels are the editor's current tile names. Phase 2 adds the shape, border
 * and layout sub controls (decision 5) and the new core styles.
 */

const button = (
  id: string,
  label: string,
  description: string,
  legacyId: number | undefined,
  className: string,
  extra: Partial<EffectEntry> = {}
): EffectEntry => ({
  id: `button.${id}`,
  layer: "button",
  label,
  description,
  tier: "core",
  engine: "css",
  cost: "still",
  source: "amped",
  colorMode: "theme",
  params: {},
  render: { kind: "class", className },
  preview: { sample: "button" },
  ...(legacyId === undefined ? {} : { legacyId }),
  addedIn: 1,
  ...extra,
});

export const BUTTON_EFFECTS: readonly EffectEntry[] = [
  button("soft", "Default", "A soft filled button", 0, "rounded-lg bg-gray-100"),
  button("pill", "Soft", "A filled button with round ends", 1, "rounded-full bg-gray-100"),
  button(
    "outline",
    "Outline",
    "A clear button with a border",
    2,
    "rounded-lg border-2 border-gray-300"
  ),
  button(
    "shadow",
    "Shadow",
    "A filled button with a drop shadow",
    3,
    "rounded-lg bg-gray-100 shadow-lg"
  ),
  button(
    "glass",
    "Glass",
    "A frosted see through button",
    4,
    "rounded-lg bg-white/30 backdrop-blur-sm"
  ),
  button(
    "neon",
    "Neon",
    "A glow in your button color",
    5,
    "rounded-lg bg-gray-100 shadow-[0_0_15px_var(--amped-glow)] hover:shadow-[0_0_25px_var(--amped-glow)] transition-shadow"
  ),
  button(
    "gradient",
    "Gradient",
    "A gradient in your button color",
    6,
    "rounded-lg bg-gradient-to-r from-[var(--amped-btn)] to-[var(--amped-btn-dark)]"
  ),
  button(
    "floating",
    "Floating",
    "Lifts a little on hover",
    7,
    "rounded-lg bg-gray-100 motion-safe:hover:-translate-y-1 transition-transform shadow-md"
  ),
  button(
    "bordered-glow",
    "Bordered glow",
    "A ring in your button color",
    8,
    "rounded-lg bg-gray-100 ring-2 ring-offset-2 ring-[var(--amped-btn)]"
  ),
  button(
    "minimal",
    "Minimal",
    "An underline, no fill",
    9,
    "border-b-2 border-gray-300 hover:border-gray-400 transition-colors rounded-none bg-transparent"
  ),
  // Phase 2 (board 07): new in v2, no v1 integer. The editor stores it as
  // buttonStyleId and keeps buttonStyle on Shadow (3) for v1 renderers.
  button(
    "hard-shadow",
    "Hard shadow",
    "A solid offset shadow in a darker shade of your button color",
    undefined,
    "rounded-lg border-2 border-[color:var(--amped-btn-dark)] shadow-[4px_4px_0_var(--amped-btn-dark)]",
    { addedIn: 2 }
  ),
];
