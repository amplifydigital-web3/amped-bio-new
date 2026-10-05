import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ThemeConfig } from "@repo/constants";
import {
  NAME_EFFECT_COLORS,
  THEME_DEFAULTS,
  composite,
  contrastRatio,
  parseHex,
  type Rgb,
} from "@repo/ui";
import { useEditor } from "@/contexts/EditorContext";
import type { Background } from "@/types/editor";

// Shared state for the Design Style and Motion rows (Screen Review 023 to 030).

/** Shapes that show the background through the button (025 I04). */
const SEE_THROUGH_BUTTONS = new Set([2, 4, 9]);

function hexColorsIn(value: string | undefined): Rgb[] {
  if (!value) return [];
  return (value.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) ?? [])
    .map(hex => parseHex(hex))
    .filter((rgb): rgb is Rgb => rgb !== null);
}

/** A still image for a background: the thumbnail, or the image itself. */
export function backgroundThumb(background?: Background): string | null {
  if (!background) return null;
  const withThumb = background as Background & { thumbnail?: string };
  if (withThumb.thumbnail) return withThumb.thumbnail;
  if (background.type === "image") return background.value || null;
  return null;
}

/**
 * Mean color of an image, for the contrast guards. Returns null when the image
 * cannot be read (no CORS, still loading); the guards then skip that surface.
 */
function useImageMean(url: string | null): Rgb | null {
  const [mean, setMean] = useState<Rgb | null>(null);
  useEffect(() => {
    setMean(null);
    if (!url) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, 16, 16);
        const data = context.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        const count = data.length / 4;
        if (!cancelled) setMean({ r: r / count, g: g / count, b: b / count });
      } catch {
        // Cross origin image: the canvas is tainted, skip the guard
      }
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return mean;
}

/** Colors behind the page card: a solid color, gradient stops, or an image mean. */
export function useBackgroundColors(background?: Background): Rgb[] | null {
  const thumb = background?.type === "color" ? null : backgroundThumb(background);
  const mean = useImageMean(thumb);
  return useMemo(() => {
    if (!background) return null;
    if (background.type === "color") {
      const stops = hexColorsIn(background.value ?? "");
      return stops.length > 0 ? stops : null;
    }
    return mean ? [mean] : null;
  }, [background, mean]);
}

function worst(colors: Rgb[], against: (bg: Rgb) => number) {
  return Math.min(...colors.map(against));
}

export interface ContrastResult {
  ratio: number;
  passes: boolean;
}

export function useDesign() {
  const editor = useEditor();
  const { theme, updateThemeConfig, setPreviewOverride } = editor;
  const config = theme.config;
  const locked = theme.user_id === null;

  const values = {
    containerStyle: config.containerStyle ?? THEME_DEFAULTS.containerStyle,
    containerColor: config.containerColor ?? THEME_DEFAULTS.containerColor,
    transparency: config.transparency ?? THEME_DEFAULTS.transparency,
    buttonStyle: config.buttonStyle ?? THEME_DEFAULTS.buttonStyle,
    buttonColor: config.buttonColor ?? THEME_DEFAULTS.buttonColor,
    buttonEffect: config.buttonEffect ?? THEME_DEFAULTS.buttonEffect,
    particlesEffect: config.particlesEffect ?? THEME_DEFAULTS.particlesEffect,
    heroEffect: config.heroEffect ?? THEME_DEFAULTS.heroEffect,
    fontFamily: config.fontFamily ?? THEME_DEFAULTS.fontFamily,
    fontSize: config.fontSize ?? THEME_DEFAULTS.fontSize,
    fontColor: config.fontColor ?? THEME_DEFAULTS.fontColor,
  };

  const backgroundColors = useBackgroundColors(config.background);

  // The page card as visitors see it: container color at its opacity over the background
  const cardColors = useMemo((): Rgb[] | null => {
    const container = parseHex(values.containerColor);
    if (!container) return null;
    const alpha = values.transparency / 100;
    if (alpha >= 1) return [container];
    if (!backgroundColors) return null;
    return backgroundColors.map(bg => composite(container, alpha, bg));
  }, [values.containerColor, values.transparency, backgroundColors]);

  const fontRgb = parseHex(values.fontColor);

  // 024 I06: text on the page card
  const cardContrast = useMemo((): ContrastResult | null => {
    if (!fontRgb || !cardColors) return null;
    const ratio = worst(cardColors, bg => contrastRatio(fontRgb, bg));
    return { ratio, passes: ratio >= 4.5 };
  }, [fontRgb, cardColors]);

  // 025 I04: button text on the button (or the background for see through shapes)
  const buttonContrast = useMemo((): ContrastResult | null => {
    if (!fontRgb) return null;
    const surfaces = SEE_THROUGH_BUTTONS.has(values.buttonStyle)
      ? cardColors
      : [parseHex(values.buttonColor)].filter((c): c is Rgb => c !== null);
    if (!surfaces || surfaces.length === 0) return null;
    const ratio = worst(surfaces, bg => contrastRatio(fontRgb, bg));
    return { ratio, passes: ratio >= 4.5 };
  }, [fontRgb, cardColors, values.buttonStyle, values.buttonColor]);

  // 030 I03: colors a name effect paints, against the card; 3:1 for large text
  const nameContrast = useCallback(
    (effect: number): ContrastResult | null => {
      const colors = (NAME_EFFECT_COLORS[effect] ?? [])
        .map(c => parseHex(c))
        .filter((c): c is Rgb => c !== null);
      if (colors.length === 0 || !cardColors) return null;
      const ratio = Math.min(
        ...colors.map(color => worst(cardColors, bg => contrastRatio(color, bg)))
      );
      return { ratio, passes: ratio >= 3 };
    },
    [cardColors]
  );

  const update = useCallback(
    (patch: Partial<ThemeConfig>) => {
      if (locked) return;
      updateThemeConfig(patch);
      setPreviewOverride(null);
    },
    [locked, updateThemeConfig, setPreviewOverride]
  );

  const preview = useCallback(
    (patch: Partial<ThemeConfig>) => setPreviewOverride({ config: patch }),
    [setPreviewOverride]
  );
  const endPreview = useCallback(() => setPreviewOverride(null), [setPreviewOverride]);

  // Colors already in the theme, for the color control's Your colors row
  const yourColors = [values.containerColor, values.buttonColor, values.fontColor];

  return {
    ...editor,
    config,
    values,
    locked,
    update,
    preview,
    endPreview,
    yourColors,
    backgroundColors,
    cardColors,
    cardContrast,
    buttonContrast,
    nameContrast,
    seeThroughButton: SEE_THROUGH_BUTTONS.has(values.buttonStyle),
  };
}

/** Formats a ratio as visitors read it: 2.1:1 */
export function formatRatio(ratio: number) {
  return `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;
}

/** The creator's card color at their opacity, for name and font tiles. */
export function cardFill(config: Partial<ThemeConfig>): CSSProperties {
  const alpha = Math.round(((config.transparency ?? 0) / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return config.containerColor ? { backgroundColor: `${config.containerColor}${alpha}` } : {};
}

/** The title of the creator's first link block, for button specimens. */
export function useSpecimenLabel() {
  const { blocks } = useDesign();
  const link = blocks.find(block => block.type === "link");
  const label = (link?.config as { label?: string } | undefined)?.label;
  return label || "My link";
}
