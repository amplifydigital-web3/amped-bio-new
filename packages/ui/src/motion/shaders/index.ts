import { SHADER_PRELUDE } from "./common";

// Theme Engine v2 phase 3b (spec 3.6): each scene shader loads in its own
// chunk, after first paint, with the engine. The registry names a program by
// key (render.program); a key with no module is unavailable and the layer
// keeps its poster.

const PROGRAMS: Readonly<Record<string, () => Promise<{ default: string }>>> = {
  aurora: () => import("./aurora"),
  silk: () => import("./silk"),
  iridescence: () => import("./iridescence"),
  "liquid-chrome": () => import("./liquid-chrome"),
  plasma: () => import("./plasma"),
  galaxy: () => import("./galaxy"),
  threads: () => import("./threads"),
  lightning: () => import("./lightning"),
  orb: () => import("./orb"),
  "dark-veil": () => import("./dark-veil"),
  grainient: () => import("./grainient"),
  "light-rays": () => import("./light-rays"),
  "dot-field": () => import("./dot-field"),
  "ripple-grid": () => import("./ripple-grid"),
  ferrofluid: () => import("./ferrofluid"),
  "molten-metal": () => import("./molten-metal"),
  topography: () => import("./topography"),
  "faulty-terminal": () => import("./faulty-terminal"),
  "letter-glitch": () => import("./letter-glitch"),
  "galaxy-field": () => import("./galaxy-field"),
  // Phase 3c: the Blob cursor
  "cursor-blob": () => import("./cursor-blob"),
};

export const SHADER_PROGRAM_KEYS = Object.keys(PROGRAMS);

/** The full fragment source for a program key: the shared prelude plus the scene. */
export async function loadShaderProgram(key: string): Promise<string | null> {
  const load = PROGRAMS[key];
  if (!load) return null;
  const module = await load();
  return SHADER_PRELUDE + module.default;
}
