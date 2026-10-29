import { newLayerNone } from "./newLayers";
import type { EffectEntry } from "./types";

/**
 * Press effects, new in v2 (decision 6, spec 3.5). A press fires on
 * pointerdown, so phones feel a button effect for the first time. It never
 * delays navigation and plays nothing under reduced motion.
 */

const press = (
  id: string,
  label: string,
  description: string,
  render: EffectEntry["render"],
  engine: EffectEntry["engine"]
): EffectEntry => ({
  id: `buttonPress.${id}`,
  layer: "buttonPress",
  label,
  description,
  tier: "core",
  engine,
  cost: "light",
  source: "amped",
  colorMode: "theme",
  params: {},
  render,
  preview: { sample: "button" },
  addedIn: 2,
});

export const BUTTON_PRESS_EFFECTS: readonly EffectEntry[] = [
  newLayerNone("buttonPress", "No press effect", "button"),
  // One circle from the press point grows to 2.5 times the button width in
  // 377 ms at a quarter of the text color's strength
  press(
    "ripple",
    "Ripple",
    "A ripple spreads from where you tap",
    {
      kind: "waapi",
      trigger: "press",
      keyframes: (_p, c) => [
        { transform: "translate(-50%, -50%) scale(0)", opacity: 0.25, backgroundColor: c.text },
        { transform: "translate(-50%, -50%) scale(1)", opacity: 0, backgroundColor: c.text },
      ],
      options: () => ({ duration: 377, easing: "cubic-bezier(0.2,0,0,1)" }),
    },
    "waapi"
  ),
  press(
    "dip",
    "Dip",
    "Presses in a little",
    {
      kind: "class",
      className:
        "motion-safe:active:scale-[0.97] transition-transform duration-[89ms] ease-[cubic-bezier(0.2,0,0,1)]",
    },
    "css"
  ),
];
