import { z } from "zod";
import { findEffect, EFFECT_IDS } from "./effects/registry";
import type { EffectLayer } from "./effects/types";

// Theme Engine v2 surface sub controls (spec 3.5, decision 5). Declared before
// the v1 schema because the Container row stores them on v1 configs too.
export const CONTAINER_SHAPES = ["rounded", "pill", "squircle", "cut", "arch", "blob"] as const;
export const BUTTON_SHAPES = ["rounded", "pill", "squircle", "cut", "ticket"] as const;
export const BORDER_STYLES = ["none", "hairline", "thick", "dashed", "gradient", "glow"] as const;
export const BUTTON_LAYOUTS = ["label", "icon", "split"] as const;

// Background schema matching the Background interface from collections
const BACKGROUND_TEXTURES = ["none", "grain", "dots", "scanlines"] as const;

const backgroundSchema = z.object({
  type: z.enum(["color", "image", "video"]),
  value: z.string().nullable(),
  id: z.string().optional(),
  label: z.string().optional(),
  thumbnail: z.string().optional(),
  fileId: z.number().optional(),
  // Theme Engine v2 Background row (spec 3.5, board 10), additive and optional.
  // A built gradient keeps `value` as its static CSS, so v1 renderers draw it;
  // the fields below let the v2 renderer drift it and rebuild it exactly.
  stops: z
    .array(
      z.object({
        color: z.string().regex(/^#[0-9a-f]{6}$/i, "Use a #RRGGBB color"),
        at: z.number().min(0).max(100),
      })
    )
    .min(2)
    .max(4)
    .optional(),
  angle: z.number().min(0).max(360).optional(),
  mesh: z.boolean().optional(),
  drift: z.boolean().optional(),
  texture: z.enum(BACKGROUND_TEXTURES).optional(),
});

// Schema for theme configuration with proper validation
export const themeConfigSchema = z.object({
  buttonStyle: z.number().optional(),
  containerStyle: z.number().optional(),
  background: backgroundSchema.optional(),
  buttonColor: z.string().optional(),
  containerColor: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.string().optional(),
  fontColor: z.string().optional(),
  transparency: z.number().optional(),
  buttonEffect: z.number().optional(),
  particlesEffect: z.number().optional(),
  heroEffect: z.number().optional(),
  // Theme Engine v2 Container row (spec 3.5, board 03), additive and optional.
  // v1 renderers ignore them; upgradeTheme carries them into the v2 container.
  containerShape: z.enum(CONTAINER_SHAPES).optional(),
  containerBorder: z.enum(BORDER_STYLES).optional(),
  // Theme Engine v2 Buttons row (spec 3.5, board 07), additive and optional.
  // buttonStyleId names a v2 style that has no v1 integer (Hard shadow); the
  // editor keeps buttonStyle on the nearest v1 look for renderers without it.
  buttonStyleId: z.enum(EFFECT_IDS.button as unknown as [string, ...string[]]).optional(),
  buttonShape: z.enum(BUTTON_SHAPES).optional(),
  buttonBorder: z.enum(BORDER_STYLES).optional(),
  buttonLayout: z.enum(BUTTON_LAYOUTS).optional(),
});

// Schema for the theme object in editTheme endpoint
export const editThemeSchema = z.object({
  theme: z.object({
    name: z.string().min(1, "Theme name is required"),
    description: z.string().optional(),
    share_level: z.string(),
    share_config: z.any(),
    config: themeConfigSchema.optional(),
  }),
});

// Schema for importing .ampedtheme files - uses the same config validation
export const ampedThemeImportSchema = themeConfigSchema;

export type Background = z.infer<typeof backgroundSchema>;
export type ThemeConfig = z.infer<typeof themeConfigSchema>;
export type EditThemeInput = z.infer<typeof editThemeSchema>;
export type AmpedThemeImport = z.infer<typeof ampedThemeImportSchema>;

// ---------------------------------------------------------------------------
// Theme Engine v2 (docs/features/theme-engine-v2.md, 3.3). themeConfigSchema
// above stays the v1 shape and is read forever. v2 names every effect by a
// registry id with clamped params; theme files and share links carry ids and
// params only, never classes, CSS or code (decision 9).
// ---------------------------------------------------------------------------

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a #RRGGBB color");

export const SCENE_TEXTURES = BACKGROUND_TEXTURES;
/** v1 offers five sizes (14, 16, 18, 20, 24 px), so v2 keeps five. */
export const FONT_SIZES = ["s", "m", "l", "xl", "xxl"] as const;

export const effectSlotSchema = (layer: EffectLayer) =>
  z.object({
    id: z.enum(EFFECT_IDS[layer] as unknown as [string, ...string[]]),
    // Clamped against the entry by clampParams before a write or a draw
    params: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
    loop: z.enum(["once", "always"]).optional(),
  });

const fontSchema = (defaultWeight: number) =>
  z.object({
    family: z.string().min(1).max(80),
    weight: z.number().int().min(100).max(900).default(defaultWeight),
    italic: z.boolean().default(false),
    axes: z.record(z.string(), z.number()).default({}),
  });

const gradientStopSchema = z.object({ color: hexColor, at: z.number().min(0).max(100) });

const sceneBaseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), value: hexColor }),
  z.object({
    type: z.literal("gradient"),
    stops: z.array(gradientStopSchema).min(2).max(4),
    angle: z.number().min(0).max(360),
    mesh: z.boolean().default(false),
    drift: z.boolean().default(false),
    texture: z.enum(SCENE_TEXTURES).default("none"),
  }),
  z.object({
    type: z.literal("image"),
    fileId: z.number().int().positive().optional(),
    value: z.string().url().optional(),
    texture: z.enum(SCENE_TEXTURES).default("none"),
    /** The catalog tile the creator picked (v1 background.id), for the editor. */
    presetId: z.string().max(80).optional(),
  }),
  z.object({
    type: z.literal("video"),
    fileId: z.number().int().positive().optional(),
    value: z.string().url().optional(),
    poster: z.string().url().optional(),
    presetId: z.string().max(80).optional(),
  }),
  z.object({ type: z.literal("shader") }).merge(effectSlotSchema("scene")),
]);

const sceneSchema = z
  .object({
    base: sceneBaseSchema,
    overlay: effectSlotSchema("scene").optional(),
  })
  .superRefine((scene, ctx) => {
    // The scene slots are engine scoped: the shader base takes only webgl ids,
    // the overlay only particles ids. Rejects a swap at write time.
    if (scene.base.type === "shader" && findEffect(scene.base.id)?.engine !== "webgl") {
      ctx.addIssue({
        code: "custom",
        path: ["base", "id"],
        message: "shader base takes a webgl effect id",
      });
    }
    if (
      scene.overlay &&
      scene.overlay.id !== "scene.none" &&
      findEffect(scene.overlay.id)?.engine !== "particles"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["overlay", "id"],
        message: "overlay takes a particles effect id",
      });
    }
  });

export const themeConfigV2Schema = z
  .object({
    version: z.literal(2),
    colors: z.object({
      button: hexColor,
      buttonText: hexColor,
      container: hexColor,
      containerOpacity: z.number().min(0).max(100),
      text: hexColor,
    }),
    fonts: z.object({
      name: fontSchema(700),
      body: fontSchema(400),
      size: z.enum(FONT_SIZES).default("m"),
    }),
    scene: sceneSchema,
    container: effectSlotSchema("container").extend({
      shape: z.enum(CONTAINER_SHAPES),
      border: z.enum(BORDER_STYLES),
    }),
    button: effectSlotSchema("button").extend({
      shape: z.enum(BUTTON_SHAPES),
      border: z.enum(BORDER_STYLES),
      layout: z.enum(BUTTON_LAYOUTS),
    }),
    buttonHover: effectSlotSchema("buttonHover"),
    buttonPress: effectSlotSchema("buttonPress"),
    name: effectSlotSchema("name").extend({
      appliesTo: z.enum(["name", "nameAndBio"]).default("name"),
    }),
    cursor: effectSlotSchema("cursor"),
  })
  .strict();

export type ThemeConfigV2 = z.infer<typeof themeConfigV2Schema>;
export type ThemeConfigV2Input = z.input<typeof themeConfigV2Schema>;
export type SceneBase = ThemeConfigV2["scene"]["base"];

/** True when a stored or imported config claims to be v2. */
export function isThemeConfigV2(value: unknown): boolean {
  return (
    typeof value === "object" && value !== null && (value as { version?: unknown }).version === 2
  );
}

/**
 * Accepts a v1 or a v2 config, dispatching on version instead of a blind
 * union: zod strips unknown keys, so a malformed v2 config would otherwise
 * fall through to the v1 branch and import as an empty config. A config that
 * claims v2 and fails the v2 schema is rejected.
 */
export const anyThemeConfigSchema = z
  .unknown()
  .transform((value, ctx): ThemeConfig | ThemeConfigV2 => {
    const result = isThemeConfigV2(value)
      ? themeConfigV2Schema.safeParse(value)
      : themeConfigSchema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) ctx.addIssue(issue);
      return z.NEVER;
    }
    return result.data;
  });

export type AnyThemeConfig = ThemeConfig | ThemeConfigV2;
