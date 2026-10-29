import type { CSSProperties } from "react";
import {
  findEffect,
  getEffect,
  isThemeConfigV2,
  upgradeTheme,
  type AnyThemeConfig,
  type EffectEntry,
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
  name: EffectEntry;
  /** The particle overlay, or null for none. */
  overlay: EffectEntry | null;
}

const PX_BY_SIZE: Record<ThemeConfigV2["fonts"]["size"], string> = {
  s: "14px",
  m: "16px",
  l: "18px",
  xl: "20px",
  xxl: "24px",
};

function gradientCss(base: Extract<ThemeConfigV2["scene"]["base"], { type: "gradient" }>) {
  const stops = base.stops.map(stop => `${stop.color} ${stop.at}%`).join(", ");
  return `linear-gradient(${base.angle}deg, ${stops})`;
}

/** A v2 config written back into the v1 value shape (colors, font, background). */
export function v1Values(v2: ThemeConfigV2): ThemeConfig {
  const base = v2.scene.base;
  const background: ThemeConfig["background"] =
    base.type === "color"
      ? { type: "color", value: base.value }
      : base.type === "gradient"
        ? { type: "color", value: gradientCss(base) }
        : base.type === "image"
          ? { type: "image", value: base.value ?? null, id: base.presetId, fileId: base.fileId }
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
  const look: CreatorLook = {
    v2,
    values: isThemeConfigV2(theme) ? v1Values(v2) : ((theme as ThemeConfig | undefined) ?? {}),
    container: getEffect("container", v2.container.id),
    button: getEffect("button", v2.button.id),
    buttonHover: getEffect("buttonHover", v2.buttonHover.id),
    name: getEffect("name", v2.name.id),
    overlay: overlay && overlay.id !== "scene.none" ? overlay : null,
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

/** True when the page has motion that loops, so it gets the Pause motion control (041 I02). */
export function hasLoopingMotion(look: CreatorLook): boolean {
  return overlayParticlesId(look) !== 0 || look.name.loop === true;
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
