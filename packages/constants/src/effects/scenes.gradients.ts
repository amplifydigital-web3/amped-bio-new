/**
 * Curated gradients for the Background row (Theme Engine v2, spec 3.5, board
 * 10). Forty gradients in five moods, plain data. The four v1 color gradients
 * keep their exact CSS string, so pages that use them keep matching their tile
 * and render the same.
 *
 * A gradient renders from its stops and angle (gradientCss). Mesh gradients
 * place up to four color blobs in the corners instead and ignore the angle.
 */

export const GRADIENT_MOODS = ["calm", "bold", "dark", "nature", "warm"] as const;
export type GradientMood = (typeof GRADIENT_MOODS)[number];

export interface GradientStop {
  color: string;
  /** Position along the gradient, 0 to 100. */
  at: number;
}

export interface GradientLook {
  stops: readonly GradientStop[];
  /** Degrees, 0 to 360. */
  angle: number;
  mesh?: boolean;
}

export interface GradientPreset extends GradientLook {
  id: string;
  label: string;
  mood: GradientMood;
  /** The exact v1 CSS for the four v1 gradients; others render from stops. */
  css?: string;
}

/** Evenly spaced stops from a list of colors. */
function spread(...colors: string[]): GradientStop[] {
  const last = Math.max(colors.length - 1, 1);
  return colors.map((color, index) => ({ color, at: Math.round((index / last) * 100) }));
}

function preset(
  id: string,
  label: string,
  mood: GradientMood,
  angle: number,
  colors: string[],
  extra: Partial<GradientPreset> = {}
): GradientPreset {
  return { id: `gradient.${id}`, label, mood, angle, stops: spread(...colors), ...extra };
}

/** In tile order: the first ten show before See all 40 (board 10). */
export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  preset("dawn", "Dawn", "calm", 160, ["#f9d9c5", "#c9d6ff"]),
  preset("tide", "Tide", "nature", 160, ["#2bc0e4", "#eaecc6"]),
  preset("plum", "Plum", "bold", 135, ["#5b247a", "#1bcedf"]),
  preset("mesh-summer", "Mesh summer", "bold", 0, ["#ff9a8b", "#ff6a88", "#ff99ac", "#fcd34d"], {
    mesh: true,
  }),
  preset("ember", "Ember", "warm", 135, ["#ff512f", "#dd2476"]),
  preset("deep", "Deep", "dark", 160, ["#0f2027", "#203a43", "#2c5364"]),
  preset("sky", "Sky", "calm", 180, ["#a1c4fd", "#c2e9fb"]),
  preset("northern", "Northern", "dark", 160, ["#071a2b", "#2bb2a0", "#7a4fd1"]),
  preset("paper", "Paper", "calm", 160, ["#f4f3fa", "#e6e1f0"]),
  preset("mint", "Mint", "nature", 135, ["#d4fc79", "#96e6a1"]),
  // The four v1 color gradients, exact strings
  preset("blue", "Blue Gradient", "bold", 90, ["#00c6ff", "#0072ff"], {
    css: "linear-gradient(to right, #00c6ff, #0072ff)",
  }),
  preset("pink-purple", "Pink Purple", "bold", 90, ["#fc466b", "#3f5efb"], {
    css: "linear-gradient(to right, #fc466b, #3f5efb)",
  }),
  preset("green-flow", "Green Flow", "nature", 90, ["#11998e", "#38ef7d"], {
    css: "linear-gradient(to right, #11998e, #38ef7d)",
  }),
  preset("warm-flame", "Warm Flame", "warm", 90, ["#f12711", "#f5af19"], {
    css: "linear-gradient(to right, #f12711, #f5af19)",
  }),
  preset("mist", "Mist", "calm", 135, ["#e0eafc", "#cfdef3"]),
  preset("lavender", "Lavender", "calm", 135, ["#e6dafa", "#b8c6f5"]),
  preset("blush", "Blush", "calm", 120, ["#fde2e4", "#e2ece9"]),
  preset("pearl", "Pearl", "calm", 180, ["#fdfbfb", "#ebedee"]),
  preset("haze", "Haze", "calm", 150, ["#d4dde8", "#a3b5cc"]),
  preset("electric", "Electric", "bold", 120, ["#4f46e5", "#06b6d4"]),
  preset("neon-pop", "Neon pop", "bold", 135, ["#f72585", "#7209b7", "#3a0ca3"]),
  preset("citrus", "Citrus", "bold", 90, ["#f7971e", "#ffd200"]),
  preset("candy", "Candy", "bold", 135, ["#ff6cab", "#7366ff"]),
  preset("midnight", "Midnight", "dark", 180, ["#0f0c29", "#302b63", "#24243e"]),
  preset("ink", "Ink", "dark", 160, ["#16152b", "#3a3858"]),
  preset("obsidian", "Obsidian", "dark", 180, ["#000000", "#434343"]),
  preset("night-bloom", "Night bloom", "dark", 0, ["#1a1033", "#5b2f70", "#0b5a80", "#16152b"], {
    mesh: true,
  }),
  preset("abyss", "Abyss", "dark", 180, ["#000428", "#004e92"]),
  preset("smoke", "Smoke", "dark", 135, ["#232526", "#414345"]),
  preset("forest", "Forest", "nature", 160, ["#134e5e", "#71b280"]),
  preset("lagoon", "Lagoon", "nature", 135, ["#43cea2", "#185a9d"]),
  preset("moss", "Moss", "nature", 150, ["#5a7247", "#a8c686"]),
  preset("meadow", "Meadow", "nature", 0, ["#a8e063", "#56ab2f", "#f9f586", "#96e6a1"], {
    mesh: true,
  }),
  preset("glacier", "Glacier", "nature", 180, ["#83a4d4", "#b6fbff"]),
  preset("sunset", "Sunset", "warm", 160, ["#ff7e5f", "#feb47b"]),
  preset("peach", "Peach", "warm", 135, ["#ffecd2", "#fcb69f"]),
  preset("apricot", "Apricot", "warm", 0, ["#ffd194", "#ff9a8b", "#f6d365", "#fda085"], {
    mesh: true,
  }),
  preset("desert", "Desert", "warm", 160, ["#c79081", "#dfa579"]),
  preset("rose-gold", "Rose gold", "warm", 135, ["#e8cbc0", "#636fa4"]),
  preset("honey", "Honey", "warm", 120, ["#f6d365", "#fda085"]),
];

/** Mesh blobs sit in the corners, clockwise from the top left. */
const MESH_CORNERS = ["0% 0%", "100% 0%", "100% 100%", "0% 100%"] as const;

/**
 * The CSS background for a gradient: a linear gradient, or four radial blobs
 * over the first color for a mesh. Static; drift is the renderer's job.
 */
export function gradientCss(look: GradientLook): string {
  const stops = look.stops.length > 0 ? look.stops : [{ color: "#000000", at: 0 }];
  if (look.mesh) {
    const blobs = MESH_CORNERS.map((corner, index) => {
      const color = stops[index % stops.length]!.color;
      return `radial-gradient(at ${corner}, ${color} 0px, transparent 55%)`;
    });
    return `${blobs.join(", ")}, ${stops[0]!.color}`;
  }
  const list = stops.map(stop => `${stop.color} ${stop.at}%`).join(", ");
  return `linear-gradient(${look.angle}deg, ${list})`;
}

/** The CSS a preset stores in v1 background.value: its v1 string or its stops. */
export function gradientPresetCss(gradient: GradientPreset): string {
  return gradient.css ?? gradientCss(gradient);
}
