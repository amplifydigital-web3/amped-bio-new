import type { EffectEntry, EffectLayer } from "./types";

/** The none entry of a layer that is new in v2. */
export const newLayerNone = (
  layer: EffectLayer,
  description: string,
  sample: "button" | "cursor"
): EffectEntry => ({
  id: `${layer}.none`,
  layer,
  label: "None",
  description,
  tier: "core",
  engine: "css",
  cost: "still",
  source: "amped",
  colorMode: "theme",
  params: {},
  render: { kind: "none" },
  preview: { sample },
  addedIn: 2,
});
