import type { EffectEntry, ParamSpec } from "./types";

/**
 * Container surfaces. The v1 containerStyle values, class for class as both
 * renderers draw them today. 6 and 8 are no longer offered in the editor but
 * still render for creators who picked them, so they stay as retired entries:
 * no existing page changes when the shared renderer ships (Rob, 7 Oct).
 */

const container = (
  id: string,
  label: string,
  description: string,
  legacyId: number | undefined,
  className: string,
  extra: Partial<EffectEntry> = {}
): EffectEntry => ({
  id: `container.${id}`,
  layer: "container",
  label,
  description,
  tier: "core",
  engine: "css",
  cost: "still",
  source: "amped",
  colorMode: "theme",
  params: {},
  render: className ? { kind: "class", className } : { kind: "none" },
  preview: { sample: "card" },
  ...(legacyId === undefined ? {} : { legacyId }),
  addedIn: 1,
  ...extra,
});

export const CONTAINER_EFFECTS: readonly EffectEntry[] = [
  container("none", "None", "No card behind your page", 0, ""),
  container(
    "frosted",
    "Frosted glass",
    "A frosted glass card",
    1,
    "bg-white/70 backdrop-blur-md rounded-2xl shadow-lg"
  ),
  container(
    "floating",
    "Floating card",
    "A white card with a soft shadow",
    2,
    "bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.12)] transition-shadow"
  ),
  container(
    "gradient-border",
    "Gradient border",
    "A gradient from your button color to your card color",
    3,
    "bg-gradient-to-r from-[var(--amped-btn)] to-[var(--amped-container)] rounded-2xl"
  ),
  container(
    "neon-glow",
    "Neon glow",
    "A card with a glow in your button color",
    4,
    "bg-white rounded-2xl shadow-[0_0_30px_var(--amped-glow)]"
  ),
  container(
    "double-border",
    "Double border",
    "A card with two thin borders",
    5,
    "bg-white rounded-2xl border-2 border-gray-200 outline outline-2 outline-offset-2 outline-gray-100"
  ),
  container(
    "soft-card",
    "Soft card",
    "A rounded card with an inner shadow",
    6,
    "bg-white/90 rounded-[2.5rem] shadow-[inset_0_0_30px_rgba(0,0,0,0.05),0_20px_40px_rgba(0,0,0,0.1)]",
    { retired: true }
  ),
  container(
    "minimal-glass",
    "Minimal glass",
    "A light glass card",
    7,
    "bg-white/50 backdrop-blur-sm rounded-xl border border-white/20"
  ),
  container(
    "arch",
    "Arch",
    "A card with an arched top",
    8,
    "relative before:absolute before:inset-x-0 before:top-0 before:-translate-y-[calc(100%-2rem)] before:h-24 before:bg-white/90 before:[border-radius:187.5px_187.5px_0_0] before:-z-10 bg-white/90 rounded-3xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.1),0_2px_8px_-2px_rgba(0,0,0,0.05)] backdrop-blur-sm",
    { retired: true }
  ),
  container(
    "modern-card",
    "Modern card",
    "A white card with a deep shadow",
    9,
    "bg-white rounded-3xl shadow-[0_35px_60px_-15px_rgba(0,0,0,0.2)]"
  ),
];

// Phase 3d premium surfaces (spec 3.5, board 03, PR TE-3d). New in v2, no v1
// integer: the editor stores them by id (containerStyleId) and keeps
// containerStyle on the nearest v1 look for renderers without them. The class
// is the surface; the moving part (edge light, sparks, stars, spotlight) is
// drawn by SurfaceFx in packages/ui from the params.

const SPEED: ParamSpec = {
  kind: "range",
  min: 0,
  max: 100,
  step: 1,
  default: 50,
  label: "Speed",
};

const premium = (
  id: string,
  label: string,
  description: string,
  className: string,
  params: Readonly<Record<string, ParamSpec>>,
  extra: Partial<EffectEntry> = {}
): EffectEntry =>
  container(id, label, description, undefined, className, {
    tier: "plus",
    cost: "light",
    params,
    addedIn: 2,
    ...extra,
  });

export const PREMIUM_CONTAINER_EFFECTS: readonly EffectEntry[] = [
  premium(
    "liquid-glass",
    "Liquid glass",
    "Clear glass that bends the light at its edges",
    "relative isolate bg-white/10 rounded-2xl border border-white/50 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-1px_0_rgba(255,255,255,0.2),0_8px_34px_rgba(0,0,0,0.12)]",
    {
      blur: { kind: "range", min: 4, max: 21, step: 1, default: 13, label: "Blur", unit: "px" },
      refraction: { kind: "range", min: 0, max: 100, step: 1, default: 50, label: "Refraction" },
    }
  ),
  premium(
    "electric-border",
    "Electric border",
    "A crackling line of light around your card",
    "relative isolate rounded-2xl",
    {
      intensity: { kind: "range", min: 0, max: 100, step: 1, default: 50, label: "Intensity" },
      speed: SPEED,
      color: { kind: "color", default: "theme", label: "Color" },
    },
    { loop: true }
  ),
  premium(
    "star-border",
    "Star border",
    "Two points of light travel along the edges",
    "relative isolate rounded-2xl border border-[color:color-mix(in_srgb,var(--amped-font,#000000)_16%,transparent)]",
    { speed: SPEED },
    { loop: true }
  ),
  premium(
    "spotlight",
    "Spotlight",
    "A soft light follows the pointer, or drifts on phones",
    "relative isolate overflow-hidden rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)]",
    {
      radius: {
        kind: "range",
        min: 89,
        max: 377,
        step: 1,
        default: 233,
        label: "Size",
        unit: "px",
      },
    },
    { loop: true }
  ),
];
