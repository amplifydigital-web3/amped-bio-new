import {
  isThemeConfigV2,
  themeConfigV2Schema,
  SCENE_TEXTURES,
  CONTAINER_SHAPES,
  BUTTON_SHAPES,
  BUTTON_LAYOUTS,
  BORDER_STYLES,
  type FONT_SIZES,
  type SceneBase,
  type ThemeConfig,
  type ThemeConfigV2,
} from "../theme";
import { findEffect } from "./registry";

/**
 * v1 to v2 (spec 3.3). upgradeTheme is pure and idempotent. It runs on read
 * in both apps and on import; v1 rows stay v1 in the database until the
 * creator saves (Rob, 7 Oct: read v1 forever, write v2 on the next save).
 *
 * Every v1 integer maps to exactly one registry id. Ids that are retired from
 * the editor keep a retired entry, so no existing page changes.
 */

type LegacyField =
  | "buttonStyle"
  | "containerStyle"
  | "buttonEffect"
  | "heroEffect"
  | "particlesEffect";

export const LEGACY_EFFECT_IDS: Readonly<Record<LegacyField, Readonly<Record<number, string>>>> = {
  buttonStyle: {
    0: "button.soft",
    1: "button.pill",
    2: "button.outline",
    3: "button.shadow",
    4: "button.glass",
    5: "button.neon",
    6: "button.gradient",
    7: "button.floating",
    8: "button.bordered-glow",
    9: "button.minimal",
  },
  containerStyle: {
    0: "container.none",
    1: "container.frosted",
    2: "container.floating",
    3: "container.gradient-border",
    4: "container.neon-glow",
    5: "container.double-border",
    6: "container.soft-card",
    7: "container.minimal-glass",
    8: "container.arch",
    9: "container.modern-card",
  },
  buttonEffect: {
    0: "buttonHover.none",
    1: "buttonHover.scale",
    2: "buttonHover.glow",
    3: "buttonHover.slide",
    4: "buttonHover.bounce",
    5: "buttonHover.pulse",
    6: "buttonHover.shake",
    7: "buttonHover.rotate",
    8: "buttonHover.pop",
    9: "buttonHover.shine",
  },
  heroEffect: {
    0: "name.none",
    1: "name.gradient",
    2: "name.glow",
    3: "name.typewriter",
    4: "name.blur-in",
    5: "name.split-reveal",
    6: "name.wave",
    7: "name.neon",
    8: "name.rainbow",
    9: "name.glitch",
  },
  particlesEffect: {
    0: "scene.none",
    1: "scene.floating-dots",
    2: "scene.links",
    3: "scene.snow",
    4: "scene.bubbles",
    5: "scene.fireflies",
    6: "scene.matrix",
    7: "scene.confetti",
    8: "scene.stars",
    9: "scene.geometric",
  },
};

/** What an id outside the map becomes, matching what v1 renders for it. */
const LEGACY_FALLBACK: Readonly<Record<LegacyField, string>> = {
  buttonStyle: "button.soft", // getButtonBaseStyle falls back to style 0
  containerStyle: "container.none",
  buttonEffect: "buttonHover.none",
  heroEffect: "name.none",
  particlesEffect: "scene.none",
};

export function legacyEffectId(field: LegacyField, value: number | undefined): string {
  if (value === undefined || !Number.isInteger(value)) return LEGACY_FALLBACK[field];
  return LEGACY_EFFECT_IDS[field][value] ?? LEGACY_FALLBACK[field];
}

/** The v1 defaults both renderers apply today (THEME_DEFAULTS in packages/ui). */
export const V1_DEFAULTS = {
  buttonColor: "#f3f4f6",
  containerColor: "#ffffff",
  fontColor: "#000000",
  transparency: 0,
  fontFamily: "Inter",
  fontSize: "16px",
  background: "#ffffff",
} as const;

const FONT_SIZE_BY_PX: Readonly<Record<string, (typeof FONT_SIZES)[number]>> = {
  "14px": "s",
  "16px": "m",
  "18px": "l",
  "20px": "xl",
  "24px": "xxl",
};

const DEFAULT_GRADIENT_STOPS = ["#3b82f6", "#8b5cf6"] as const;

const HEX_IN_TEXT = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

/** #RGB, #RRGGBB, #RRGGBBAA and rgb() or rgba() to lowercase #rrggbb, else null. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input.trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text)?.[1];
  if (hex) {
    const six =
      hex.length === 3
        ? hex
            .split("")
            .map(c => c + c)
            .join("")
        : hex.slice(0, 6);
    return `#${six.toLowerCase()}`;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(text);
  if (rgb) {
    const parts = rgb.slice(1, 4).map(n => Math.min(255, Number(n)));
    return `#${parts.map(n => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

function relativeLuminance(hex: string): number {
  const channel = (offset: number) => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Black or white, whichever reads better on the button (the contrast guard rule). */
export function readableTextOn(background: string): "#000000" | "#ffffff" {
  const l = relativeLuminance(background);
  const onBlack = (l + 0.05) / 0.05;
  const onWhite = 1.05 / (l + 0.05);
  return onBlack >= onWhite ? "#000000" : "#ffffff";
}

const GRADIENT_KEYWORDS: Readonly<Record<string, number>> = {
  "to top": 0,
  "to top right": 45,
  "to right top": 45,
  "to right": 90,
  "to bottom right": 135,
  "to right bottom": 135,
  "to bottom": 180,
  "to bottom left": 225,
  "to left bottom": 225,
  "to left": 270,
  "to top left": 315,
  "to left top": 315,
};

/**
 * A v1 CSS gradient string to a v2 gradient base. The first two hex colors
 * become the stops (one hex color repeats); a string with no hex color falls
 * back to the default stops at 90 degrees. The angle comes from the CSS
 * direction (a deg value or a to keyword); CSS defaults to 180 (to bottom).
 */
export function parseLegacyGradient(css: string): Extract<SceneBase, { type: "gradient" }> {
  const colors = (css.match(HEX_IN_TEXT) ?? []).flatMap(c => normalizeHex(c) ?? []);
  const first = colors[0];
  const base = { type: "gradient" as const, mesh: false, drift: false, texture: "none" as const };
  if (first === undefined) {
    return {
      ...base,
      angle: 90,
      stops: [
        { color: DEFAULT_GRADIENT_STOPS[0], at: 0 },
        { color: DEFAULT_GRADIENT_STOPS[1], at: 100 },
      ],
    };
  }
  const args = /gradient\(\s*([^,]+),/i.exec(css)?.[1]?.trim().toLowerCase() ?? "";
  const deg = /^(-?\d+(?:\.\d+)?)deg$/.exec(args)?.[1];
  const angle =
    deg !== undefined
      ? ((Number(deg) % 360) + 360) % 360
      : (GRADIENT_KEYWORDS[args.replace(/\s+/g, " ")] ?? 180);
  return {
    ...base,
    angle,
    stops: [
      { color: first, at: 0 },
      { color: colors[1] ?? first, at: 100 },
    ],
  };
}

function absoluteUrl(value: string | null | undefined): string | undefined {
  // http or https with a host, the shape z.string().url() accepts here
  return value && /^https?:\/\/[^\s/?#]+[^\s]*$/i.test(value) ? value : undefined;
}

function positiveInt(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
}

type SceneTexture = (typeof SCENE_TEXTURES)[number];

// Read at call time: theme.ts and this file import each other
function textureOf(texture: string | undefined): SceneTexture {
  const known: readonly string[] = SCENE_TEXTURES;
  return texture && known.includes(texture) ? (texture as SceneTexture) : "none";
}

// A value from the list, or the fallback for one that slipped past the schema
function oneOf<T extends string>(list: readonly T[], value: string | undefined, fallback: T): T {
  return value !== undefined && (list as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * A gradient the Background row built (stops on the v1 background, phase 2).
 * Returns null when the stops are missing or invalid, so the legacy CSS parse
 * runs instead.
 */
function builtGradient(
  background: NonNullable<ThemeConfig["background"]>
): Extract<SceneBase, { type: "gradient" }> | null {
  const stops = (background.stops ?? []).flatMap(stop => {
    const color = normalizeHex(stop.color);
    return color && Number.isFinite(stop.at)
      ? [{ color, at: Math.min(100, Math.max(0, stop.at)) }]
      : [];
  });
  if (stops.length < 2 || stops.length > 4) return null;
  const angle =
    typeof background.angle === "number" && Number.isFinite(background.angle)
      ? Math.min(360, Math.max(0, background.angle))
      : 180;
  return {
    type: "gradient",
    stops,
    angle,
    mesh: background.mesh === true,
    drift: background.drift === true,
    texture: textureOf(background.texture),
  };
}

function upgradeBackground(background: ThemeConfig["background"]): SceneBase {
  if (!background) return { type: "color", value: V1_DEFAULTS.background };
  const presetId = background.id ? background.id.slice(0, 80) : undefined;
  switch (background.type) {
    case "image":
      return {
        type: "image",
        fileId: positiveInt(background.fileId),
        value: absoluteUrl(background.value),
        texture: textureOf(background.texture),
        presetId,
      };
    case "video":
      return {
        type: "video",
        fileId: positiveInt(background.fileId),
        value: absoluteUrl(background.value),
        poster: absoluteUrl(background.thumbnail),
        presetId,
      };
    default: {
      const built = builtGradient(background);
      if (built) return built;
      const value = background.value ?? "";
      if (/gradient\(/i.test(value)) return parseLegacyGradient(value);
      return { type: "color", value: normalizeHex(value) ?? V1_DEFAULTS.background };
    }
  }
}

/**
 * A v1 or v2 config to v2. A v2 config is validated and returned as parsed,
 * so upgradeTheme(upgradeTheme(x)) equals upgradeTheme(x). Throws only for a
 * config that claims v2 and is malformed; v1 input never throws.
 */
export function upgradeTheme(
  config: ThemeConfig | ThemeConfigV2 | null | undefined
): ThemeConfigV2 {
  if (isThemeConfigV2(config)) return themeConfigV2Schema.parse(config);
  const v1 = (config ?? {}) as ThemeConfig;

  const button = normalizeHex(v1.buttonColor) ?? V1_DEFAULTS.buttonColor;
  const fontFamily = (v1.fontFamily?.trim() || V1_DEFAULTS.fontFamily).slice(0, 80);
  const transparency =
    typeof v1.transparency === "number" && Number.isFinite(v1.transparency)
      ? Math.min(100, Math.max(0, v1.transparency))
      : V1_DEFAULTS.transparency;
  const overlay = legacyEffectId("particlesEffect", v1.particlesEffect);
  // A v2 style the Buttons row stored by id wins over the v1 integer (phase 2)
  const storedButton = v1.buttonStyleId ? findEffect(v1.buttonStyleId) : undefined;
  const buttonId =
    storedButton?.layer === "button"
      ? storedButton.id
      : legacyEffectId("buttonStyle", v1.buttonStyle);
  const containerId = legacyEffectId("containerStyle", v1.containerStyle);
  const storedHover = v1.buttonEffectId ? findEffect(v1.buttonEffectId) : undefined;
  const storedPress = v1.buttonPressId ? findEffect(v1.buttonPressId) : undefined;

  return themeConfigV2Schema.parse({
    version: 2,
    colors: {
      button,
      buttonText: readableTextOn(button),
      container: normalizeHex(v1.containerColor) ?? V1_DEFAULTS.containerColor,
      containerOpacity: transparency,
      text: normalizeHex(v1.fontColor) ?? V1_DEFAULTS.fontColor,
    },
    fonts: {
      name: { family: fontFamily, weight: 700 },
      body: { family: fontFamily, weight: 400 },
      size: FONT_SIZE_BY_PX[v1.fontSize ?? V1_DEFAULTS.fontSize] ?? "m",
    },
    scene: {
      base: upgradeBackground(v1.background),
      ...(overlay === "scene.none" ? {} : { overlay: { id: overlay, params: {} } }),
    },
    container: {
      id: containerId,
      params: {},
      // The Container row stores shape and border on v1 configs (phase 2)
      shape: oneOf(
        CONTAINER_SHAPES,
        v1.containerShape,
        containerId === "container.arch" ? "arch" : "rounded"
      ),
      border: oneOf(BORDER_STYLES, v1.containerBorder, "none"),
    },
    button: {
      id: buttonId,
      params: {},
      // The Buttons row stores shape, border and layout on v1 configs (phase 2)
      shape: oneOf(BUTTON_SHAPES, v1.buttonShape, buttonId === "button.pill" ? "pill" : "rounded"),
      border: oneOf(BORDER_STYLES, v1.buttonBorder, "none"),
      layout: oneOf(BUTTON_LAYOUTS, v1.buttonLayout, "label"),
    },
    buttonHover: {
      // A v2 hover stored by id wins over the v1 integer (phase 2)
      id:
        storedHover?.layer === "buttonHover"
          ? storedHover.id
          : legacyEffectId("buttonEffect", v1.buttonEffect),
      params: {},
    },
    buttonPress: {
      id: storedPress?.layer === "buttonPress" ? storedPress.id : "buttonPress.none",
      params: {},
    },
    name: { id: legacyEffectId("heroEffect", v1.heroEffect), params: {}, appliesTo: "name" },
    cursor: { id: "cursor.none", params: {} },
  });
}
