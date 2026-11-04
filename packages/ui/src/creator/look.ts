import type { CSSProperties } from "react";
import {
  HOVER_SPEED_MS,
  NAME_SPEED_FACTOR,
  findEffect,
  getEffect,
  gradientCss,
  isNameEntrance,
  isThemeConfigV2,
  nameSettle,
  pageCost,
  upgradeTheme,
  type PageCost,
  type AnyThemeConfig,
  type EffectEntry,
  type ParamValues,
  type ThemeColors,
  type ThemeConfig,
  type ThemeConfigV2,
} from "@repo/constants";
import { THEME_DEFAULTS, themeCssVars } from "../theme-style";

/**
 * Theme Engine v2, phase 1b (docs/features/theme-engine-v2.md, 3.4): the look
 * a creator page wears, resolved once from a v1 or a v2 theme config.
 *
 * Effects come from the registry by id (upgradeTheme maps v1 integers to ids).
 * Colors, font and background stay in their v1 shape: a v1 config passes
 * through untouched, so the page renders exactly what it renders today, and a
 * v2 config is written back into that shape. Pure, no React state, cached per
 * config object.
 */
export interface CreatorLook {
  /** The config as v2, for anything that reads effect ids or params. */
  v2: ThemeConfigV2;
  /** Colors, font and background in the v1 shape both renderers read. */
  values: ThemeConfig;
  container: EffectEntry;
  button: EffectEntry;
  buttonHover: EffectEntry;
  /** Press effect, new in v2 (decision 6). */
  buttonPress: EffectEntry;
  name: EffectEntry;
  /** The particle overlay, or null for none. */
  overlay: EffectEntry | null;
  /** The overlay's params from the v2 slot (empty for v1 configs). */
  overlayParams: ParamValues;
  /** The creator's colors as effects read them (theme color mode). */
  colors: ThemeColors;
}

const PX_BY_SIZE: Record<ThemeConfigV2["fonts"]["size"], string> = {
  s: "14px",
  m: "16px",
  l: "18px",
  xl: "20px",
  xxl: "24px",
};

/** A v2 config written back into the v1 value shape (colors, font, background). */
export function v1Values(v2: ThemeConfigV2): ThemeConfig {
  const base = v2.scene.base;
  const background: ThemeConfig["background"] =
    base.type === "color"
      ? { type: "color", value: base.value }
      : base.type === "gradient"
        ? {
            type: "color",
            value: gradientCss(base),
            stops: base.stops,
            angle: base.angle,
            ...(base.mesh ? { mesh: true } : {}),
            ...(base.drift ? { drift: true } : {}),
            ...(base.texture !== "none" ? { texture: base.texture } : {}),
          }
        : base.type === "image"
          ? {
              type: "image",
              value: base.value ?? null,
              id: base.presetId,
              fileId: base.fileId,
              ...(base.texture !== "none" ? { texture: base.texture } : {}),
            }
          : base.type === "video"
            ? {
                type: "video",
                value: base.value ?? null,
                thumbnail: base.poster,
                id: base.presetId,
                fileId: base.fileId,
              }
            : undefined; // a shader base paints its poster in phase 3
  return {
    buttonColor: v2.colors.button,
    containerColor: v2.colors.container,
    fontColor: v2.colors.text,
    fontFamily: v2.fonts.body.family,
    fontSize: PX_BY_SIZE[v2.fonts.size],
    transparency: v2.colors.containerOpacity,
    background,
  };
}

const CACHE = new WeakMap<object, CreatorLook>();

/** The look for a theme config. Missing or empty configs get the v1 defaults. */
export function lookFor(theme: AnyThemeConfig | null | undefined): CreatorLook {
  if (theme && CACHE.has(theme)) return CACHE.get(theme)!;
  const v2 = upgradeTheme(theme ?? undefined);
  const overlay = v2.scene.overlay ? findEffect(v2.scene.overlay.id) : undefined;
  const values = isThemeConfigV2(theme) ? v1Values(v2) : ((theme as ThemeConfig | undefined) ?? {});
  const text = values.fontColor || THEME_DEFAULTS.fontColor;
  const look: CreatorLook = {
    v2,
    values,
    container: getEffect("container", v2.container.id),
    button: getEffect("button", v2.button.id),
    buttonHover: getEffect("buttonHover", v2.buttonHover.id),
    buttonPress: getEffect("buttonPress", v2.buttonPress.id),
    name: getEffect("name", v2.name.id),
    overlay: overlay && overlay.id !== "scene.none" ? overlay : null,
    overlayParams: v2.scene.overlay?.params ?? {},
    colors: {
      button: values.buttonColor || THEME_DEFAULTS.buttonColor,
      buttonText: text,
      container: values.containerColor || THEME_DEFAULTS.containerColor,
      text,
    },
  };
  if (theme) CACHE.set(theme, look);
  return look;
}

/**
 * The Tailwind classes an entry renders. A looping entry under Pause motion or
 * reduced motion shows its settled look (041 I02).
 */
export function effectClassName(entry: EffectEntry, paused = false): string {
  if (entry.render.kind !== "class") return "";
  if (paused && entry.loop) return entry.render.settledClassName ?? "";
  return entry.render.className;
}

/** The v1 particlesEffect number the overlay plays, or 0. Retired overlays play none (041 I06). */
export function overlayParticlesId(look: CreatorLook): number {
  if (!look.overlay || look.overlay.retired) return 0;
  return look.overlay.legacyId ?? 0;
}

/**
 * The overlay the page plays: a v1 overlay or a phase 2 scene stored by id.
 * Retired overlays play none (041 I06).
 */
export function playingOverlay(look: CreatorLook): EffectEntry | null {
  return look.overlay && !look.overlay.retired ? look.overlay : null;
}

/** True when the name effect keeps looping (a loop entry settled to always). */
export function nameLoops(look: CreatorLook): boolean {
  return look.name.loop === true && nameSettle(look.name, look.v2.name.loop) === "always";
}

/**
 * Inline style for the name (and the bio when the effect applies to it), from
 * Settle and the parameter strip (board 08):
 * - a loop settled to once plays one cycle, then rests on its last frame; a
 *   weak device plays every loop once (spec 3.7: name, loop to once);
 * - Speed scales the cycle (Medium is the cycle as shipped);
 * - a custom color replaces the text color the effect paints with.
 */
export function nameLoopStyle(
  look: CreatorLook,
  paused = false,
  weak = false
): CSSProperties | undefined {
  const style: Record<string, string | number> = {};
  const params = look.v2.name.params;
  if (!paused && look.name.loop === true) {
    if (weak || !nameLoops(look)) style.animationIterationCount = 1;
    const factor = NAME_SPEED_FACTOR[String(params["speed"])];
    if (factor && look.name.loopMs)
      style.animationDuration = `${Math.round(look.name.loopMs * factor)}ms`;
  }
  const color = params["color"];
  if (
    params["palette"] === "custom" &&
    typeof color === "string" &&
    /^#[0-9a-f]{6}$/i.test(color)
  ) {
    style["--amped-font"] = color;
    style["--amped-name-glow"] = `${color}B3`;
  }
  return Object.keys(style).length > 0 ? (style as CSSProperties) : undefined;
}

/** The hover's Speed (editor chrome): Fast 144 ms, Slow 377 ms, Default its own timing. */
export function hoverSpeedMs(look: CreatorLook): number | undefined {
  return HOVER_SPEED_MS[String(look.v2.buttonHover.params["speed"])];
}

/** What the page costs to run (spec 3.7), for the editor's cost chip. */
export function lookCost(look: CreatorLook): PageCost {
  return pageCost(look.v2);
}

/**
 * True when the bio wears the name effect too (Applies to: Name and bio). The
 * letter entrances stay on the name: a bio can be long and carry links.
 */
export function nameOnBio(look: CreatorLook): boolean {
  return (
    look.v2.name.appliesTo === "nameAndBio" &&
    look.name.id !== "name.none" &&
    !isNameEntrance(look.name)
  );
}

/** True when the page has motion that loops, so it gets the Pause motion control (041 I02). */
export function hasLoopingMotion(look: CreatorLook): boolean {
  return playingOverlay(look) !== null || nameLoops(look);
}

/** True when a container surface is on. */
export function containerOn(look: CreatorLook): boolean {
  return look.container.id !== "container.none";
}

/** The container color with the theme opacity as an 8 digit hex, as both renderers write it. */
export function containerBackground(look: CreatorLook): string {
  const { containerColor, transparency } = look.values;
  const alpha = Math.round((transparency ?? THEME_DEFAULTS.transparency) * 2.55)
    .toString(16)
    .padStart(2, "0");
  return `${containerColor}${alpha}`;
}

/** The creator's text color with the default. */
export function lookFontColor(look: CreatorLook): string {
  return look.values.fontColor || THEME_DEFAULTS.fontColor;
}

/** The theme CSS variables plus --amped-font, the focus outline color (039 I13). */
export function lookCssVars(look: CreatorLook): CSSProperties {
  return {
    ...themeCssVars(look.values),
    "--amped-font": lookFontColor(look),
  } as CSSProperties;
}
