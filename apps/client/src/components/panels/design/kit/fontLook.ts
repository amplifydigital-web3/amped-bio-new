import type { FontPick, ThemeConfig } from "@repo/constants";

// Theme Engine v2 fonts, phase 2b (spec 3.8, board 02): how the Text row reads
// and writes the name and body faces on a v1 config.

export type FontRole = "name" | "body";

/** The name face as stored, or the v1 look: the body family at 700. */
export function currentNameFont(config: ThemeConfig, fontFamily: string): FontPick {
  return config.nameFont ?? { family: fontFamily, weight: 700 };
}

/** The body face: the theme's fontFamily with its stored weight, italic and axes. */
export function currentBodyFont(config: ThemeConfig, fontFamily: string): FontPick {
  return { family: fontFamily, weight: 400, ...config.bodyFontStyle };
}

/** The patch that writes a face for a role. The body keeps fontFamily for v1 renderers. */
export function fontPatch(role: FontRole, pick: FontPick): Partial<ThemeConfig> {
  if (role === "name") return { nameFont: pick };
  const { family, ...style } = pick;
  const plain = (style.weight ?? 400) === 400 && !style.italic && !style.axes;
  return { fontFamily: family, bodyFontStyle: plain ? undefined : style };
}

/** The collapsed Text row value: Fraunces and Figtree. */
export function fontsValue(config: ThemeConfig, fontFamily: string): string {
  const name = currentNameFont(config, fontFamily).family;
  return name === fontFamily ? fontFamily : `${name} and ${fontFamily}`;
}
