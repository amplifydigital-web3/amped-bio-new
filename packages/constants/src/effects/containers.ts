import type { EffectEntry } from "./types";

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
  legacyId: number,
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
  legacyId,
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
