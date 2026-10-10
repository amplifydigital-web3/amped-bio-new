# Theme Engine v2: effects registry, shared renderer, catalog, fonts, sharing

Status: spec and boards for approval, 2026-10-10. Build Board #28. The three card decisions are answered (Rob chose the recommendation on each). Build starts on Rob's approval of the boards in section 3.1 and decisions 4 to 12.
Owner: Rob Frasca. Drafted by Claude, 2026-10-10, against amplifydigital-web3/amped-bio-new `development` at 29db7cb.
Overview: docs/overviews/theme-engine-v2.md (project doc claude/amped-theme-engine-v2-overview-2026-10-07.md). This spec implements it and does not restate the research.
Screens: Prism 2.2 boards 01 to 12 on the Theme Engine v2 design canvas (https://claude.ai/artifact/5oErPADNijTy9hTbXuA4GV). Design QA: docs/features/theme-engine-v2-design-qa.md. Screen Review rows 139 to 150.
Depends on: Prism 2.2 rollout #20 (Design screens 023 to 033 shipped), motion layer #26 phase 2 (merged in #291 on 8 Oct; its frame watchdog is extracted into `packages/ui` in phase 1b), test setup PR #304 (Vitest, open). Feeds: Paid themes #3.
Plan rechecked: 2026-10-10 against `development` 29db7cb and the motion layer as merged (#290, #291). Changes in the revision log.

## 1. Research summary

What is on `development` today, confirmed in code on 10 Oct.

- `packages/constants/src/theme.ts`: `themeConfigSchema` with bare numbers for `buttonStyle`, `containerStyle`, `buttonEffect`, `particlesEffect`, `heroEffect`, strings for `fontFamily`, `fontSize`, colors, a `background` object `{type: color | image | video, value, id, label, thumbnail, fileId}` and `transparency`. `editThemeSchema` carries `share_level: string` and `share_config: any`. `ampedThemeImportSchema` is the bare config.
- `apps/client/src/utils/styles.ts` and `apps/landingpage/src/lib/styles.ts`: four integer to class maps each (`getButtonBaseStyle` 0 to 9, `getContainerStyle` 0 to 9, `getButtonEffectStyle` 0 to 9, `getHeroEffectStyle` 0 to 9). The editor map has infinite `animate-bounce` and `animate-pulse` on hover and references `animate-fade-in` and `animate-slide-up`, which no stylesheet defines. Hero 7 hardcodes `#ff00ff`, hero 1 hardcodes blue to purple.
- `apps/server/src/trpc/theme.ts`: `editTheme` (id 0 creates), `deleteTheme`, `getUserThemes`, `applyTheme`. `applyTheme` with `themeId 0` does `findFirst` by user and overwrites that row; marketplace rows (`user_id null`) are applied by id. `User.theme` is a string holding the id. Nothing reads `share_level` or `share_config`.
- `packages/ui/src/theme.ts`: export writes the bare config, import parses it with the same schema. File name sanitizing shipped for Screen Review 031.
- Design panel: `apps/client/src/components/panels/design/` with `DesignPanel.tsx`, `StyleMotionTabs.tsx`, `rows/` (Background, Buttons, Container, MotionRows, Text), `kit/` (ColorControl, CreatorArt, DisclosureRow, Notices, OptionTile, useDesign, useThemeActions), `themes/`. Prism 2.2 rows 023 to 033 are shipped here.
- Particles: `@tsparticles/all` at `^3.8.1` loaded on first use since motion layer phase 0 (PR #272). Two byte identical `particleConfigs.ts` files with hardcoded colors.
- Fonts: 8 families in `rows/TextRow.tsx`; one Google Fonts link in `apps/client/index.html` and `apps/landingpage/src/app/layout.tsx` loads 10 families on every page.
- No theme tests. `apps/client/public/themes/Rings.ampedtheme` is missing.
- Tests: end to end runs on Cypress (`apps/client`, `e2e:test`). Unit and UI tests arrive with open PR #304: Vitest, jsdom and Testing Library in `apps/client` and `apps/landingpage` only, `turbo test` at the root. `packages/constants` and `packages/ui` have no test runner yet. #304 adds `EditorContext.test.tsx`, which asserts today's `theme.editTheme` copy on save.
- Motion layer as merged (#290, #291, 8 Oct): the landing hero is raw WebGL with no library (`apps/landingpage/src/components/landing/motion/HeroBeam.tsx`, one full screen triangle, CSS poster first). OGL, GSAP and Lenis are not in the repo. The frame watchdog (median of the first 45 visible frames over 28 ms keeps the poster) and `lowPower()` (Save Data, under 4 cores, under 4 GB) live inline in `HeroBeam.tsx`. Pause motion state lives in `apps/landingpage/src/components/landing/motion/motionState.ts` (`amped.motion.paused` in localStorage, the `amped:motion-paused` event, `useMotionOff`, `usePausedChoice`), keyed to match the creator page control (041 I02). Motion tokens are exported from `@repo/ui` as `MOTION` and `PRISM_EASE`. Flags follow `VITE_SHOW_*` and `NEXT_PUBLIC_SHOW_*` (`NEXT_PUBLIC_SHOW_MOTION`, `VITE_SHOW_BROADCAST`, `VITE_SHOW_RNS`).
- `framer-motion`, `tsparticles-slim` v2 and `@lottiefiles/dotlottie-react` are still in `apps/client/package.json`.

## 2. Overview, decisions and scope

v2 replaces integer maps with one typed effect registry in `packages/constants/src/effects/` and one shared page renderer in `packages/ui/src/creator/`, then grows the catalog to about 150 picks across six layers (scene, container, button, button effect, name, cursor), opens the full Google Fonts catalog, versions the theme file, and adds saved looks, history and share links. The overview holds the architecture, catalog tiers, library and license verdicts and the competition read.

### Decisions answered by Rob on the Build Board card (recommended answer on all three)

1. **Effect budget per page.** 1 heavy or 3 light effects before the weak device fallback renders the still version. Written into 3.7.
2. **Font delivery.** Self host the chosen families through a Fontsource build step on Amped's CDN, no request to Google before consent. Written into 3.8; the Google path stays as `FONT_DELIVERY=google` for staging comparison only.
3. **react-bits in sold themes.** No. react-bits derived effects ship free as core and plus; any shader Amped wants inside a paid theme is rewritten as Amped's own GLSL. Written into 3.5 (the `source` field) and 3.11.

### Decision open for Rob (added 10 Oct on the plan recheck)

13. **WebGL engine for showcase scenes and the blob cursor.** Recommended: no library. Extract the raw WebGL setup from the merged `HeroBeam.tsx` into a shared helper in `packages/ui/src/motion/webgl.ts` (context, full screen triangle, uniforms, resize, loop, about 2 KB) and port each shader onto it. Why: the motion layer shipped this way, so it is proven on the live site, it adds no dependency, and every ported shader becomes Amped's own code, which also serves decision 3. Alternative: add OGL 1.0.x (about 13 KB gzip). Faster to port the react-bits shaders as written, but it is a new dependency the motion layer chose not to take. The registry names the engine `webgl` either way, so only phase 3 changes.

### Direction from Rob (7 Oct): transition, not a standalone system

- Wrap today's effects in the registry with a legacy id map. No pixel change on existing pages; snapshot tests prove it.
- Ship the shared renderer beside the old two behind `SHOW_THEME_V2` (staging all, then Rob's handle, then all). Delete the old renderers one release after full rollout.
- Read v1 rows forever. Write v2 on the next save. Additive database changes only. No long lived v2 branch.

### Decisions made in this spec (recommended, Rob confirms with the boards)

4. **Scene replaces Background plus Particles.** One Scene layer with a base slot (color, gradient, photo, video, shader) and an overlay slot (particles). The Style tab Background row edits the base; the Motion tab Scene row edits motion scenes and particles, and when a shader scene is on it replaces the base while it runs (board 10 notice). Why: today particles already sit over the background. Alternative: a third row. More rows, same result.
5. **Shape, border and layout are sub controls, not ids.** Container and Buttons each carry `shape`, `border` and (buttons) `layout` params. Why: 8 surfaces, 6 shapes and 6 borders yield 288 looks from 20 entries. Alternative: 288 tiles.
6. **Press is a new slot.** `buttonPress` fires on `pointerdown`, so phones feel an effect for the first time. Hover stays pointer only.
7. **Ten saved looks, twenty versions.** `Theme` rows per user capped at 10 (`kind = look`), `ThemeVersion` keeps the last 20 saves per look. Why: history and A/B without unbounded storage.
8. **Share links are read only and revocable.** `amped.bio/t/<slug>` opens the Themes tab with the look previewed and credited. Revoking the slug returns 404. Author credit is a switch, on by default. Downloads from the link page are a switch, off by default. Why: creators asked for sharing in Discord; a switch keeps anonymous looks possible.
9. **No code in theme files, ever.** Files and links carry ids and clamped params only. The registry resolves everything.
10. **Names first, libraries never.** Effect labels name what the eye sees (Aurora, Magnet, Shiny). Cost words are Light and Heavy. Tier words are Plus and Showcase. No token, reward or rate words in any effect copy.
11. **Readability is measured, not assumed.** The contrast guard runs on every pick; the scene guard samples the rendered frame behind the name and bio when no surface is set and offers Add a surface (board 08).
12. **Tiles play from the registry.** Every tile preview derives from the entry's `preview` recipe; heavy tiles show a build time video thumbnail, never a live WebGL context. One live instance at a time.

### Out of scope

Paid themes (#3) beyond the `tier`, `price` and entitlement hooks. Three.js, Vanta, matter-js, Rive, GSAP, Motion. Per block effects. Custom shader upload. Theme marketplace moderation beyond the existing admin screen.

## 3. Detailed spec

### 3.1 Screens

Boards live on the Theme Engine v2 design canvas. Every board passed the Prism 2.2 gate on 10 Oct (design QA). Phone boards are 390 x 844; desktop boards 1440 wide.

| Board | Surface | Row | What it shows |
| --- | --- | --- | --- |
| 01 | Design, Motion tab, desktop | 139 | Scene row open: Show filter (All, Light only, Particles, Shaders), tile grid with tier badges and cost dots, parameter strip (Intensity, Speed, Colors, Motion), cost chip and weak phone warning above the preview, Device budget toggle, Pause motion |
| 02 | Design, Style tab, desktop | 140 | Text row open: Name font and Body font switch, search over 1,942 families, category chips, Popular shelf of font tiles that render the creator's name, See all, weight and optical size sliders for variable families, size, color with the measured ratio, font weight line above the preview |
| 03 | Design, Style tab, desktop | 141 | Container row open: Surface grid (None, Frosted glass, Floating card, Spotlight, Liquid glass, Electric border), Shape chips, Border chips, Color, Opacity, Spotlight follows, contrast line above the preview |
| 04 | Design, Themes tab, desktop, tall | 142 | Current look card with Layers chips, Copy share link, Save as new look; My looks shelf (4 of 10, Import file); Collections with mood chips, Light only, Theme of the week; Shared with me; preview banner Previewing with Apply and Escape |
| 05 | Design, Motion tab, phone | 143 | Scene row as a two column grid; parameter bottom sheet with Intensity, Speed, Colors, Motion, Done |
| 06 | Share link landing, public, desktop | 144 | amped.bio/t/<slug>: title, Made by, usage count, layer list with cost, Use this look, Save to My looks, Download .ampedtheme (when allowed), live preview on placeholder content |
| 07 | Design, Style tab, desktop | 145 | Buttons row open: Style grid (Soft, Outline, Glass, Gradient, Hard shadow, Specular), Shape chips, Border chips, Button color, Text color with ratio, Layout chips |
| 08 | Design, Motion tab, desktop | 146 | Name row open: ten effect tiles rendering the creator's name, Settle (Play once, Loop), Speed, Colors, Applies to; the scene readability guard above the preview with Add a surface |
| 09 | Design, Motion tab, desktop | 147 | Button hover row open: ten tiles on the creator's button, Strength, Speed, phone note; Button press and Cursor rows collapsed with their values |
| 10 | Design, Style tab, desktop, tall | 148 | Background row open: kind chips (Colors, Gradients, Photos, Videos, Upload), gradient grid with Your gradient and See all 40, builder (stops, Add stop, Angle, Motion Still or Drift), Texture chips |
| 11 | Design, Themes tab, phone | 149 | Current look card with share, My looks and Collections as horizontal shelves, Undo line |
| 12 | Share this look dialog, desktop | 150 | Link field with Copy link, Show my handle switch, Let people download the file switch, usage line, Stop sharing, Done |

Not drawn, to build QA from the conventions: loading and empty states for each shelf; the locked marketplace theme notice (kept from 033); import conflict and v1 upgrade notices; Shared with me empty; My looks at 10 of 10 (Save as new look disabled with the reason); the weak device still version in the preview (the Weak toggle shows it on the same boards); Visitor view; Cursor row tiles (same tile pattern as 09); Button press row tiles (same pattern); the phone font picker sheet (02 pattern inside the 05 sheet); share link revoked page (404 with Claim your page).

### 3.2 Effect registry

New folder `packages/constants/src/effects/`. One file per layer plus `index.ts`, `types.ts` and `legacy.ts`.

```ts
export type EffectLayer = "scene" | "container" | "button" | "buttonHover" | "buttonPress" | "name" | "cursor";
export type EffectTier = "core" | "plus" | "showcase";
export type EffectEngine = "css" | "waapi" | "canvas" | "particles" | "webgl";
export type EffectCost = "still" | "light" | "heavy";
export type EffectSource = "amped" | "tsparticles" | "react-bits";   // decision 3: react-bits never inside a sold theme

export type ParamSpec =
  | { kind: "range"; min: number; max: number; step: number; default: number; label: string; unit?: string }
  | { kind: "choice"; options: readonly string[]; default: string; label: string }
  | { kind: "color"; default: "theme" | `#${string}`; label: string }    // "theme" reads the creator's colors
  | { kind: "text"; maxLength: number; default: string; label: string }; // Rotating words second line

export interface EffectEntry<P extends Record<string, ParamSpec> = Record<string, ParamSpec>> {
  id: string;                 // stable, kebab case, never reused: "scene.aurora", "name.shiny"
  layer: EffectLayer;
  label: string;              // what the eye sees, never the library
  description: string;        // one line, shown as the tile tooltip
  tier: EffectTier;
  engine: EffectEngine;
  cost: EffectCost;
  source: EffectSource;
  colorMode: "fixed" | "theme";
  pointer?: "fine";           // fine pointer only (hover, cursor); phones render the still fallback
  params: P;
  loop?: boolean;             // looping effects get the Settle control (once | always)
  render: EffectRender;       // see 3.4
  preview: PreviewRecipe;     // see 3.10
  legacyId?: number;          // v1 integer this entry replaces
  addedIn: 1 | 2;             // 1 = existed in v1, 2 = new in v2
}

export type EffectRender =
  | { kind: "class"; className: string | ((p: ParamValues, c: ThemeColors) => string) }      // Tailwind classes from the Prism preset
  | { kind: "style"; style: (p: ParamValues, c: ThemeColors) => React.CSSProperties }
  | { kind: "waapi"; keyframes: (p, c) => Keyframe[]; options: (p) => KeyframeAnimationOptions; trigger: "mount" | "hover" | "press" | "always" }
  | { kind: "particles"; options: (p, c) => ISourceOptions; plugins: readonly string[] }    // tsParticles v4 slim plus plugins
  | { kind: "webgl"; shader: string; uniforms: (p, c) => Record<string, number | number[]>; poster: (c) => string } // poster = CSS gradient painted before the engine loads
  | { kind: "canvas"; module: () => Promise<{ mount: CanvasMount }> };
```

Rules enforced at build time by a test over the registry:

- `id` is unique across layers and matches `^(scene|container|button|buttonHover|buttonPress|name|cursor)\.[a-z0-9-]+$`.
- Every `legacyId` is covered exactly once per layer by `legacy.ts`.
- `cost: "heavy"` only with engine `webgl`, `canvas` or `particles` with a trail plugin. `css` and `waapi` entries are `still` or `light`.
- `tier: "showcase"` entries carry `pointer` or a `webgl` or `particles` engine, never `css`.
- A `source: "react-bits"` entry can never be referenced by a `Theme` row with `price > 0` (3.9 server check).
- Every `params` key has a `default` inside its range.
- Labels and descriptions pass `scripts/check-compliance-copy.ts` (no banned words, no dashes).

`EFFECT_IDS` is derived per layer and feeds the zod enums in 3.3. `getEffect(layer, id)` returns the entry or the layer's `none` entry. `listEffects(layer, {tier, cost, engine})` powers the row filters.

### 3.3 Schema v2 and the legacy map

`packages/constants/src/theme.ts` keeps `themeConfigSchema` (v1) unchanged and adds:

```ts
export const effectSlotSchema = (layer: EffectLayer) => z.object({
  id: z.enum(EFFECT_IDS[layer]),
  params: z.record(z.string(), z.union([z.number(), z.string()])).default({}),  // clamped by clampParams(entry, params)
  loop: z.enum(["once", "always"]).optional(),
});

export const themeConfigV2Schema = z.object({
  version: z.literal(2),
  colors: z.object({
    button: hex, buttonText: hex, container: hex, containerOpacity: z.number().min(0).max(100), text: hex,
  }),
  fonts: z.object({
    name: z.object({ family: z.string().max(80), weight: z.number().min(100).max(900).default(700), italic: z.boolean().default(false), axes: z.record(z.string(), z.number()).default({}) }),
    body: z.object({ family: z.string().max(80), weight: z.number().min(100).max(900).default(400), italic: z.boolean().default(false), axes: z.record(z.string(), z.number()).default({}) }),
    size: z.enum(["s", "m", "l", "xl"]).default("m"),
  }),
  scene: z.object({
    base: z.discriminatedUnion("type", [
      z.object({ type: z.literal("color"), value: hex }),
      z.object({ type: z.literal("gradient"), stops: z.array(z.object({ color: hex, at: z.number().min(0).max(100) })).min(2).max(4), angle: z.number().min(0).max(360), mesh: z.boolean().default(false), drift: z.boolean().default(false), texture: z.enum(["none", "grain", "dots", "scanlines"]).default("none") }),
      z.object({ type: z.literal("image"), fileId: z.number().int().positive().optional(), value: z.string().url().optional(), texture: z.enum(["none", "grain", "dots", "scanlines"]).default("none") }),
      z.object({ type: z.literal("video"), fileId: z.number().int().positive().optional(), value: z.string().url().optional(), poster: z.string().url().optional() }),
      z.object({ type: z.literal("shader"), ...effectSlotSchema("scene").shape }),
    ]),
    overlay: effectSlotSchema("scene").optional(),          // particles
  }),
  container: effectSlotSchema("container").extend({ shape: z.enum(CONTAINER_SHAPES), border: z.enum(BORDER_STYLES) }),
  button: effectSlotSchema("button").extend({ shape: z.enum(BUTTON_SHAPES), border: z.enum(BORDER_STYLES), layout: z.enum(["label", "icon", "split"]) }),
  buttonHover: effectSlotSchema("buttonHover"),
  buttonPress: effectSlotSchema("buttonPress"),
  name: effectSlotSchema("name").extend({ appliesTo: z.enum(["name", "nameAndBio"]).default("name") }),
  cursor: effectSlotSchema("cursor"),
}).strict();

export const anyThemeConfigSchema = z.union([themeConfigV2Schema, themeConfigSchema]);
export const CONTAINER_SHAPES = ["rounded", "pill", "squircle", "cut", "arch", "blob"] as const;
export const BUTTON_SHAPES = ["rounded", "pill", "squircle", "cut", "ticket"] as const;
export const BORDER_STYLES = ["none", "hairline", "thick", "dashed", "gradient", "glow"] as const;
```

`legacy.ts` exports `upgradeTheme(v1: ThemeConfig): ThemeConfigV2`:

- `buttonStyle` 0 to 9 map to `button.soft`, `button.pill` (shape pill), `button.outline`, `button.shadow`, `button.glass`, `button.neon`, `button.gradient`, `button.floating`, `button.bordered-glow`, `button.minimal`. Ids outside the map become `button.soft`.
- `containerStyle` 0, 1, 2, 3, 4, 5, 7, 9 map to `container.none`, `frosted`, `floating`, `gradient-border`, `neon-glow`, `double-border`, `minimal-glass`, `modern-card`. 6 maps to `container.modern-card`; 8 maps to `container.frosted` with `shape: "arch"`.
- `buttonEffect` 0 to 9 map to `buttonHover.none`, `scale`, `glow`, `slide`, `bounce`, `pulse`, `shake`, `rotate`, `pop`, `shine`. Bounce and pulse become 233 ms one shot on both renderers (the editor's infinite loop was a drift bug).
- `heroEffect` 0, 2, 6, 7, 8, 9 map to `name.none`, `glow`, `wave`, `neon`, `rainbow`, `glitch`. 1 maps to `name.gradient` (returns in v2). 3 maps to `name.typewriter` (fixed). 4 and 5 (undefined classes today) map to `name.blur-in` and `name.split-reveal`, the nearest entrances.
- `particlesEffect` maps to `scene.overlay`: 0 none, then `scene.floating-dots`, `links`, `snow`, `bubbles`, `fireflies`, `confetti`, `stars`, `geometric`. 6 (retired Matrix) becomes none.
- `background` maps to `scene.base`: `color` to `{type: "color"}`, a CSS gradient string to `{type: "gradient"}` parsed into stops and angle (the 4 known gradients are matched by string; any other string becomes a two stop gradient from its first two hexes), `image` and `video` keep their ids and urls.
- `fontFamily` to `fonts.name.family` and `fonts.body.family` (same family), `fontSize` to `fonts.size`, colors to `colors`, `transparency` to `colors.containerOpacity`.
- `buttonText` is derived: the contrast guard picks black or white against `button`.

`upgradeTheme` is pure and idempotent and runs on read in both apps and on import. Writes store v2 from the first save after rollout. `editTheme` accepts `anyThemeConfigSchema` and stores what it receives (v1 rows stay v1 until the creator saves). A round trip test asserts `upgradeTheme(v1)` renders the same class list as today's maps for all 10 x 10 x 10 x 10 x 9 combinations by comparing the shared renderer's output to a frozen snapshot of the old maps.

### 3.4 Shared renderer

`packages/ui/src/creator/CreatorPage.tsx` becomes the one renderer. Signature: `CreatorPage({ theme: ThemeConfigV2, profile, blocks, mode: "edit" | "preview" | "public", device?: "strong" | "typical" | "weak", paused?: boolean, onCost?: (cost: PageCost) => void })`.

- `Preview.tsx` (client) and `ProfileView.tsx` (landingpage) become wrappers that upgrade the theme and mount `CreatorPage`. This closes D10 from `docs/prism/batch-08-creator-page.md`.
- Layer order, back to front: scene base, scene overlay, cursor canvas (public and preview only, fine pointers), container, blocks, name. The name effect wraps the h1 (and the bio p when `appliesTo` is `nameAndBio`).
- `themeCssVars()` in `packages/ui/src/theme-style.ts` keeps the existing variables and adds `--amped-btn-text`, `--amped-name-font`, `--amped-body-font`, `--amped-font-size`, `--amped-scene-a`, `--amped-scene-b`, `--amped-scene-c` (the three scene palette colors derived from the theme: button, text, container).
- `renderEffect(entry, params, colors, trigger)` resolves an entry's `render`: `class` and `style` entries return classes and inline style; `waapi` entries attach `element.animate()` on their trigger through a small hook `useEffectAnimation`; `particles`, `webgl` and `canvas` entries mount through `React.lazy` chunks named `effects-particles`, `effects-webgl`, `effects-canvas`.
- Keyframes move out of the three CSS files into the Prism preset plugin `packages/ui/src/prism/tailwind-preset.js` under `addUtilities` with `animate-amped-*` names. Durations and easing come from `MOTION` and `PRISM_EASE` from `@repo/ui` (89, 144, 233, 377, 610 ms, `cubic-bezier(0.2, 0, 0, 1)`). No bounce overshoot.
- Mode rules: `edit` renders editor only affordances (hover to preview an override, empty block placeholders); `preview` renders the public output with the editor's pause and device controls applied; `public` renders for visitors. `preview` and `public` share every pixel.
- Pause motion: `CreatorPage` reads `useMotionOff()` from `packages/ui/src/motion/motionState.ts` (the merged landing control, same storage key). `paused` stops WAAPI animations (`animation.pause()`), sets tsParticles `pause()`, stops the WebGL loop and hides the cursor canvas. `prefers-reduced-motion` forces `paused` and renders every effect still (the `css` entries have `motion-safe:` prefixes, as today).
- The guard against money surfaces stays: `CreatorPage` passes `effectsAllowed={false}` into any pool block, stake panel or wallet view, and the block frame drops scene, cursor and name wrappers inside those regions (motion layer Prism 15 and 17 rules).

### 3.5 Effect catalog and motion recipes

Every entry below ships with its tier, engine, cost and parameter set. Durations use Prism 14 tokens. All hover and press effects move only transform, opacity, shadow or filter. Loop entries get the Settle control. Items marked keep exist today.

**Scene base (Style tab, Background row, board 10).** `color`, `gradient` (2 to 4 stops, angle 0 to 360, `mesh` turns the stops into four drifting radial blobs animated with `@property` over 13 s, `drift` sweeps the angle over 21 s, both `light`), `image`, `video` (poster first, data saver falls back to the poster), `texture` overlay (`grain` SVG `feTurbulence` data URI at 0.08 alpha, `dots` 3 px repeating radial gradient, `scanlines` 2 px repeating linear gradient; all `still`). 40 curated gradients ship as data in `scenes.gradients.ts` grouped by mood (Calm, Bold, Dark, Nature, Warm) and are matched to the four v1 gradients by string.

**Scene shaders and particles (Motion tab, Scene row, board 01).**

| Id | Label | Tier | Engine | Cost | Params | Recipe |
| --- | --- | --- | --- | --- | --- | --- |
| scene.floating-dots, links, snow, bubbles, fireflies, confetti, stars, geometric | keep | core | particles | light | density 10 to 100 (default 40), speed 10 to 100, colors theme or custom | Factories `(colors, params) => ISourceOptions` on tsParticles v4 slim; paint.fill reads scene-a, scene-b |
| scene.fire, fountain, fireworks, meteors, hyperspace, sea-anemone, triangles, squares, big-circles, ambient | official presets | plus | particles | light | density, speed, colors | one `@tsparticles/preset-*` each, colors remapped to the theme |
| scene.emoji-rain, hearts, leaves, petals, coins | plus | particles | light | density, speed, size 8 to 48, set (emoji string, up to 6) | `shape-emoji`; coins use `shape-image` with Amped's own sprite |
| scene.magnetic-dots, attract, bubble-hover | plus | particles | light | density, strength 10 to 100 | `interaction-external-repulse`, `-attract`, `-bubble`; fine pointers, still elsewhere |
| scene.trail | Comet trails | showcase | particles | heavy | density, length 10 to 100 | `effect-trail` plugin |
| scene.galaxy-field | Galaxy field | showcase | webgl | heavy | points 50k to 200k, speed, colors | Amped authored GPU point sprites, under 3 KB GLSL, poster is a radial gradient |
| scene.aurora, silk, iridescence, liquid-chrome, plasma, galaxy, threads, lightning, orb, dark-veil, grainient, light-rays, dot-field, ripple-grid | showcase | webgl | heavy | intensity 0 to 100, speed 0 to 100 (0 stops), colors theme or custom, loop | react-bits shaders ported to the WebGL engine (decision 13) (source react-bits); each paints its poster gradient first and mounts after first paint |
| scene.ferrofluid, molten-metal, topography, faulty-terminal, letter-glitch | showcase | webgl | heavy | intensity, speed, colors, pointer reactivity 0 to 100 | react-bits, pointer reactive, still on coarse pointers |

**Containers (Style tab, Container row, board 03).** Keep: none, frosted, floating, gradient-border, neon-glow, double-border, minimal-glass, modern-card (core, css, still). New: `container.liquid-glass` (plus, css plus SVG displacement filter, light, params blur 4 to 21, refraction 0 to 100; falls back to frosted without `backdrop-filter`), `container.animated-border` (plus, css `@property --angle` conic sweep 8 s, light), `container.star-border` (plus, css, light, speed), `container.spotlight` (plus, css plus 10 lines of JS, light, params radius 89 to 377, follows pointer or drifts), `container.glare` (plus, css, light), `container.electric-border` (showcase, css plus SVG `feTurbulence` displaced stroke, light, params intensity, speed, color), `container.tilt` (showcase, waapi, light, fine pointers, params depth 0 to 100). Sub controls on every container: `shape` (rounded r21, pill, squircle `border-radius: 34% / 45%` with `clip-path` fallback, cut corners 13 px, arch (today's id 8), blob) and `border` (none, hairline 1 px line, thick 3 px, dashed, gradient (conic in the theme colors), glow (`0 0 21px` in scene-a)).

**Buttons (Style tab, Buttons row, board 07).** Keep ten (core, css, still). New: `button.hard-shadow` (core, `4px 4px 0` in the dark button color), `button.specular` (plus, css plus JS, light, rim light follows the pointer), `button.liquid-glass` (plus, same filter as the container), `button.gradient-border` and `button.animated-fill` (plus, css `@property` sweep, light). Sub controls: `shape` (rounded, pill, squircle, cut, ticket), `border` (as containers), `layout` (label, icon slot at 21 px left, split with a chevron right).

**Button hover (Motion tab, board 09).** Keep nine (core, css, light, 233 ms one shot on both renderers; bounce and pulse no longer loop). New: `buttonHover.fill-sweep` (core, css pseudo element wipe 233 ms), `underline-grow` (core), `border-draw` (core), `icon-slide` and `arrow-nudge` (core, child transform), `magnet` (plus, waapi, fine pointers, params strength 10 to 100: the button translates toward the pointer up to 8 px and rotates up to 2 deg, settles at 377 ms), `lift-tilt` (plus, css `perspective(377px) rotateX(8deg) translateY(-3px)` 233 ms), `jelly` (plus, waapi `scale(1.12, 0.9)` to `scale(0.96, 1.04)` to `scale(1)` over 377 ms). Params on all: strength 0 to 100, speed (89, 144, 233, 377 ms).

**Button press (Motion tab, new row).** `buttonPress.none`, `ripple` (core, waapi: one circle from the press point scales to 2.5 x the button width in 377 ms at 0.25 alpha of the text color), `click-spark` (plus, canvas, 8 lines burst 233 ms), `jelly-press` (plus, waapi), `dip` (core, css `scale(0.97)` 89 ms). Press fires on `pointerdown`, releases on `pointerup` or `pointercancel`, and never delays navigation.

**Name (Motion tab, board 08).** Keep: glow, wave, neon, rainbow, glitch (core, css; neon and rainbow read the theme colors; glitch is 610 ms once by default). New: `name.gradient` (core, css `bg-clip-text` in scene-a to scene-b, loop sweeps the angle), `shiny` (core, css sheen sweep 2.6 s, loop or once), `blur-in`, `split-reveal`, `decrypt`, `typewriter` (core, waapi one shot entrances, 610 ms, once per visit, `sessionStorage` key `amped.entrance.<handle>`), `outline` (core, `-webkit-text-stroke` 1.5 px), `shadow-stack` (core, 5 stacked `text-shadow` steps in the dark text color), `chrome` (core, metal gradient clip), `weight-pulse` (plus, css plus JS, needs a variable family with a `wght` axis, weight follows pointer distance 300 to 900), `fuzzy` (plus, canvas, edge noise), `rotating-words` (plus, waapi, second line `text` param up to 40 chars, swaps every 2.6 s), `circular` (plus, css, name on a circle around the avatar), `depth-parallax` (showcase, waapi, fine pointers, 3 layers move up to 8 px), `particle-text` (showcase, particles `polygon-mask` plugin on the name path, heavy). Params: speed, colors, `appliesTo` (name, name and bio), Settle on loop entries.

**Cursor (Motion tab, new row).** All `pointer: "fine"`, none render on touch. `cursor.none`, `glow` (plus, css plus JS, one 144 px radial follows the pointer with lerp 0.15), `ring` (plus, 34 px ring, lerp 0.2), `spark-trail`, `pixel-trail`, `dot-trail` (plus, canvas, trail length 8 to 34), `blob` (showcase, webgl metaball, heavy), `splash` (showcase, WebGL fluid, heavy, the heaviest entry; counts as 2 heavy). Cursor effects never hide the system cursor and never cover focus rings (`pointer-events: none`, `z-index` below the dialog layer).

Hover, press and cursor rows carry the line: Hover needs a pointer. Phones feel the press effect instead.

### 3.6 Engines and loading

- **CSS and WAAPI.** No chunk. Keyframes from the Prism preset. `@property` declarations registered once in `CreatorPage`.
- **tsParticles.** Upgrade both apps to `@tsparticles/engine` 4.x, `@tsparticles/react` 4.x and the slim bundle; drop `@tsparticles/all` and `tsparticles-slim` v2. `effects-particles` chunk loads the slim engine plus the plugins the active entry lists (`plugins` on the entry), 25 to 30 KB gzip. `particleConfigs.ts` in both apps is deleted; factories live in `packages/constants/src/effects/scenes.particles.ts`. Editor runs at 60 fps like the public page.
- **WebGL.** `effects-webgl` chunk: the engine per decision 13 (recommended: the shared raw WebGL helper extracted from `HeroBeam.tsx`, about 2 KB; alternative OGL 1.0.x, about 13 KB) plus the active shader (2 to 5 KB). Every `webgl` entry paints its `poster` CSS gradient on the scene element first; the canvas fades in over 377 ms after the first rendered frame, as the landing hero does. `preserveDrawingBuffer` off, `antialias` off, `dpr` capped at 2 (1.5 on typical, 1 on weak).
- **Canvas.** `effects-canvas` chunk for click spark, trails and fuzzy text; no library.
- **Fonts.** See 3.8.
- The editor bundle gains no library. All three chunks load inside the preview frame only when the theme uses them. A CI size check (`scripts/check-bundle-size.ts`, run by hand while GitHub Actions billing is down) fails if the public page's first load grows more than 10 KB gzip over the baseline recorded in `docs/features/theme-engine-v2-baseline.json`.

### 3.7 Device budget and the watchdog

Phase 1b extracts the frame watchdog and `lowPower()` from `apps/landingpage/src/components/landing/motion/HeroBeam.tsx` (merged in #291) into `packages/ui/src/motion/watchdog.ts`, and `motionState.ts` from the same folder into `packages/ui/src/motion/motionState.ts`. `HeroBeam.tsx` and `PauseMotionButton.tsx` import them with no behavior change. v2 extends the watchdog:

- `deviceClass()` returns `weak` when `navigator.hardwareConcurrency < 4`, `navigator.connection.saveData` is true, `prefers-reduced-motion` is set, or `deviceMemory < 4`; `strong` when cores are 8 or more and the GPU reports a discrete or Apple renderer through `WEBGL_debug_renderer_info`; otherwise `typical`.
- `pageCost(theme)` sums the cost classes of the active entries (still 0, light 1, heavy 3; `cursor.splash` is 6). Budget (decision 1): over 3 means the page is Heavy. The preview chip reads Light or Heavy with the effect count (boards 01, 09, 10).
- On `weak`, or when the frame watchdog measures a median frame above 28 ms over the first 45 frames, the renderer drops layers to their still fallback in this order: cursor, scene overlay, scene shader (to its poster), name (loop to once). It never drops containers, buttons or fonts. The drop is logged once as `theme_effect_dropped { layer, id, reason }`.
- The editor's Device budget toggle (Strong, Typical, Weak) forces `deviceClass` for the preview only and is remembered per session.
- `cursor` and `pointer: "fine"` entries never mount on `(pointer: coarse)`.

### 3.8 Fonts

- Catalog: `scripts/fonts/build-catalog.ts` reads the Google Fonts Developer API at build time and writes `packages/constants/src/fonts/catalog.json` (family, category, variable axes with ranges, popularity rank, subsets), about 60 KB gzip, imported lazily when the Text row opens. A `pairings.json` of 24 curated name plus body pairs ships beside it.
- Picker (board 02): search (prefix and substring over family names), category chips (Serif, Sans, Display, Handwriting, Mono), Popular shelf (top 24 by rank), Pairings shelf, See all opens the full list virtualized at 4 per row. Tiles render the creator's display name in the face; the tile loads the family's `text=` subset of the creator's name only. Weight and italic controls; `wght`, `wdth`, `opsz` sliders when the family exposes the axis. The body font limits size to the four steps; buttons stay 16 to 20 px whatever the size.
- Delivery (decision 2): `scripts/fonts/mirror.ts` mirrors the subset files of every family a published page uses into Amped's S3 plus CloudFront under `/fonts/<family>/<subset>-<weight>.woff2` on first use, through a server job triggered by `theme.editTheme` when `fonts.name.family` or `fonts.body.family` changes. The public page emits one `<link rel="preload">` per family and a `@font-face` block with `font-display: swap` and `size-adjust` from the catalog's metrics so text does not jump. No request leaves to Google from a visitor's browser. The flag `FONT_DELIVERY=google` keeps the current link path for staging comparison only.
- Both apps drop the 10 family link in `index.html` and `layout.tsx`. Figtree and Bebas Neue load through the Prism preset only.
- The name font loads its `text=` subset of the display name plus the bio's first 120 characters when `appliesTo` is `nameAndBio`; the body font loads the Latin subset (plus the subsets the bio needs, detected by script).

### 3.9 Theme files, looks, history and share links

**Data model** (additive, `apps/server/prisma/schema.prisma`):

```prisma
model Theme {
  // existing fields stay: id, user_id, name, description, share_level, share_config, config, thumbnail, created_at, updated_at
  kind         String   @default("look") @db.VarChar(16)   // look | marketplace
  config_version Int    @default(1)                         // 1 or 2, set on write
  share_slug   String?  @unique @db.VarChar(48)
  share_credit Boolean  @default(true)
  share_download Boolean @default(false)
  share_uses   Int      @default(0)
  price        BigInt?                                      // null = free; set by #3 only
  versions     ThemeVersion[]
}

model ThemeVersion {
  id        Int      @id @default(autoincrement())
  themeId   Int      @map("theme_id")
  config    Json
  createdAt DateTime @default(now())
  theme Theme @relation(fields: [themeId], references: [id], onDelete: Cascade)
  @@index([themeId, createdAt])
  @@map("theme_versions")
}
```

`User.theme` stays a string in this release (reads cast to int); a follow up migration makes it an int foreign key once v1 rows are gone. `share_level` becomes `private | link` and `share_config` holds `{credit, download}` mirrored from the columns above until the columns are the source of truth (one release).

**Server procedures** (`apps/server/src/trpc/theme.ts`, additive):

| Procedure | Auth | Behavior |
| --- | --- | --- |
| `theme.editTheme` | private | Accepts `anyThemeConfigSchema`. Clamps every param through `clampParams`, drops unknown ids (zod enum), rejects `source: react-bits` entries when `price > 0` (3.11). Writes a `ThemeVersion` row and trims to the last 20. Enforces 10 looks per user on create (error `THEME_LIMIT` with the count). Triggers the font mirror job on family change |
| `theme.applyTheme` | private | `themeId 0` no longer `findFirst`: the client always passes the look id it edits; `0` only creates a new look when the user has none. Marketplace apply copies the config into a new look (Make an editable copy) instead of pointing `User.theme` at the marketplace row, so edits never touch the shared row |
| `theme.duplicate` | private | Copies a look (name gets a counter) |
| `theme.rename` | private | 40 char limit |
| `theme.history` | private | Last 20 versions with timestamps |
| `theme.restore` | private | Writes a version's config as a new version and applies it |
| `theme.share` | private | Creates or returns `share_slug` (8 chars, base32, from the name plus a random suffix), sets `share_level = link`, accepts `{credit, download}`. Rate limit 10 per hour |
| `theme.unshare` | private | Clears the slug; the link 404s |
| `theme.bySlug` | public | `{ name, author: handle or null, config, cost, uses, createdAt, download }`. Never returns the author's profile, email or wallet. Increments `share_uses` on Use this look, not on view |
| `theme.applyShared` | private | Copies a shared config into a new look (`Save to My looks`) or applies it to the current look (`Use this look`). Counts a use |

**Theme file v2.** `.ampedtheme` becomes `{ "$schema": "https://amped.bio/theme/2", "name", "author": handle or null, "createdAt", "config": ThemeConfigV2 }`. Import accepts v1 files (bare config) and v2 files, upgrades v1, validates, clamps, and autosaves with the existing 8 second Undo. Export writes v2 only. Locked marketplace themes stay non exportable. Import never carries files: `scene.base` of type `image` or `video` with a `fileId` the importer does not own is replaced by the look's current base and a notice says so.

**Share link page** (board 06), a Next route `apps/landingpage/src/app/t/[slug]/page.tsx`: server rendered, `noindex` when `credit` is off, otherwise indexable with the author handle in the title. Renders `CreatorPage` in `preview` mode with placeholder profile content (Your name, Your bio goes here, three Your link rows), the layer list from the registry labels, the cost line, Use this look (signed in: applies; signed out: opens sign up with `?look=<slug>` and applies after), Save to My looks, and Download when allowed. Revoked or unknown slug returns 404 with Claim your page.

### 3.10 Editor behavior

- **Rows.** Style: Background, Container, Buttons, Text. Motion: Scene, Button hover, Button press, Name, Cursor. One row open at a time (027 convention). Each row's collapsed line reads the registry label of its current pick, with the tier word when it is not core.
- **Tiles.** `kit/OptionTile.tsx` renders from `entry.preview`: `{ kind: "static", render }` (a CSS recipe on the creator's own background and colors), `{ kind: "live", mount }` (one live instance at a time, on hover or focus or tap, 3 s on touch), or `{ kind: "video", src }` (a 2 s loop generated at build time by `scripts/effects/render-thumbnails.ts` for every `webgl`, `canvas` and heavy `particles` entry, muted, `playsinline`, plays only while hovered or focused). Tiles are `button[role=radio]` in a `radiogroup` with roving focus. Tier badge (Plus, Showcase) at top left, cost dot with the word in the label, check at top right on the selected tile.
- **Filters.** Scene row: Show All, Light only, Particles, Shaders. Collections: mood chips plus Light only. The Light only filter hides heavy entries so a creator on a phone never picks what their phone cannot run.
- **Parameter strip.** Under the selected tile, a G2 well with the entry's params rendered by `ParamSpec.kind`: `range` as a labeled slider with the value, `choice` as a segmented control or chips, `color` as Your theme or Custom with the color control, `text` as a 40 char input. Settle appears on loop entries. Phones get the same controls in a bottom sheet (board 05). Changes debounce 233 ms into `previewOverride` and autosave 800 ms after the last change through `trpc.theme.editTheme` as today.
- **Preview frame.** Mounts `CreatorPage` in `preview` mode. Controls: Phone or Desktop, Device budget (Strong, Typical, Weak), Pause motion. A chip or notice above the frame reads the page cost (Light with the count, or Heavy with the still version warning in the solid warning style), or a measured contrast line when the open row sets a color. Visitor view hides the chip row and editor affordances.
- **Guards.** The contrast guard stays (4.5:1 on cards and buttons, 3:1 on the name). The scene guard (board 08): when a scene base of type gradient (mesh or drift), image, video or shader, or a particle overlay, runs behind the name or bio with `container.none`, `CreatorPage` in preview mode samples the rendered frame under the text box every 610 ms for 5 s after a change, computes the worst ratio, and when it falls under 3:1 (name) or 4.5:1 (bio) shows the warning with the measured ratio and one fix, Add a surface, which sets `container.frosted` at the current opacity. The guard never blocks saving.
- **Themes tab** (boards 04, 11). Current look card: name, saved time, Layers chips (each jumps to its row), cost line, Copy share link (opens board 12), Save as new look (disabled at 10 of 10 with the reason). My looks shelf with Duplicate, Rename, Share, Export and Delete in the tile menu, and Import file. Collections with search, chips, Theme of the week (admin pick, falls back to the most used shared look of the week). Shared with me: looks opened from share links and not yet saved, kept in local storage per browser. Previewing a theme pins it in the frame with Apply and Escape as today.
- **Share dialog** (board 12). Link field read only with Copy link; Show my handle switch; Let people download the file switch; usage line; Stop sharing (confirm in place: the button reads Stop sharing, then Confirm for 5 s); Done.
- **Keyboard.** Tiles arrow keys within a row, Enter or Space selects. Sliders arrow keys step by `step`. Escape closes the parameter sheet and the share dialog and returns focus to the opener.
- **Copy rules.** Decision 10. Strings live in `packages/constants/src/effects/copy.ts` and run through the compliance scan.

### 3.11 Compliance, accessibility, security, performance

- **Compliance.** No effect may render inside pool blocks, stake flows or wallet views (3.4). No effect copy uses the banned terms from the gating, broadcast and explorer lists; `scripts/check-compliance-copy.ts` adds `packages/constants/src/effects/**` and the share page. Share links and author credit carry no reward or referral language. GSAP stays out of creator effects. `source: "react-bits"` entries are refused in a priced theme by the server (decision 3) until counsel clears the Commons Clause question; the check is one line in `theme.editTheme` and in the future `theme.publishPaid`. Font delivery before consent follows decision 2.
- **Accessibility.** `prefers-reduced-motion` renders every effect still. Pause motion on every public page with a looping effect, now covering cursor and scene effects. Cursor effects never replace the system cursor or cover focus rings. Effects move only transform, opacity, shadow or filter; text stays selectable. Tiles are a radiogroup with roving focus; tier badges and cost dots carry text. The contrast and scene guards run on every pick. Entrances play once per visit and never delay content.
- **Security.** Theme files and share links carry ids and params only; the registry resolves ids; zod enums reject unknown ids; `clampParams` clamps ranges on the server. `schemas/theme.schema.ts` in admin and the `config: z.any()` admin input are replaced by `anyThemeConfigSchema`. Share slugs are unguessable (40 bits random). `theme.bySlug` is rate limited at 60 per minute per IP. Import of a file above 64 KB is refused.
- **Performance.** Public page targets stay LCP under 2.5 s and INP under 200 ms on a Lighthouse mobile run (Moto G Power class, by hand while CI is down). Every scene paints a still poster first. Budget per 3.7. Editor bundle gains no library. First load growth capped at 10 KB gzip. Particles at 60 fps in both apps. Font subsets keep the name font under 10 KB per page.
- **Privacy.** The share page shows the author handle only with credit on. No analytics event carries a theme config; events carry ids. Font mirroring stores nothing about visitors.

### 3.12 Analytics

Client events through the analytics foundation: `design_row_opened { tab, row }`, `effect_picked { layer, id, tier, cost }`, `effect_param_changed { layer, id, param }`, `font_picked { role, family, variable }`, `device_budget_toggled { value }`, `pause_motion_toggled { surface }`, `scene_guard_shown { ratio }`, `scene_guard_fixed`, `look_saved`, `look_duplicated`, `look_restored`, `theme_shared { credit, download }`, `theme_unshared`, `share_page_viewed { slug }`, `share_look_used { slug, mode: apply | save }`, `theme_file_imported { version }`, `theme_file_exported`. Server events: `theme_effect_dropped { layer, id, reason }` (sampled 10%), `font_mirrored { family }`.

KPIs 90 days after phase 2: creators with a non default theme 60% of published pages (today's share recorded at phase 1); creators using a v2 only effect 35%; median effect cost per page under 3; share links created per 100 active creators 8; share link use rate 25% of views; public page LCP p75 under 2.5 s on heavy pages; scene guard fix rate 50% of shows.

### 3.13 Phases, flags and PR order

| Phase | Ships | Flag | Size |
| --- | --- | --- | --- |
| 1a Registry and schema | `packages/constants/src/effects/` with every v1 effect as an entry, `legacy.ts`, `themeConfigV2Schema`, `upgradeTheme`, registry tests, round trip test, compliance scan on effect copy, Rings file restored, `console.group` debug calls removed, dead dependencies removed (`framer-motion`, `tsparticles-slim`, `@lottiefiles/dotlottie-react` still in `apps/client/package.json` at 29db7cb) | none (no visible change). Lands after #304; adds Vitest configs to `packages/constants` and `packages/ui` on the #304 pattern | 1 week |
| 1b Shared renderer | `CreatorPage` in `packages/ui`, the watchdog, `lowPower()` and `motionState.ts` extracted from the merged landing motion into `packages/ui/src/motion/` (hero unchanged), wrappers in both apps, keyframes into the Prism preset, `Preview.tsx` and `ProfileView.tsx` behind `SHOW_THEME_V2` (`SHOW_THEME_V2` on the server, `VITE_SHOW_THEME_V2` on the client, `NEXT_PUBLIC_SHOW_THEME_V2` on the public page, matching the `SHOW_` convention), snapshot per registry entry against the old maps, drift bugs fixed (bounce and pulse, hero 4 and 5, focus states) | `SHOW_THEME_V2` staging all, then Rob's handle, then all | 1 to 2 weeks |
| 1c Particles v4 | tsParticles v4 slim with color aware factories, both `particleConfigs.ts` deleted, 60 fps in the editor | same flag | 3 days |
| 2 Core catalog | Shape, border and layout sub controls, mesh and drift gradients, 40 gradients and the builder, textures, 10 official presets, new core button styles, fill sweep, ripple and the press row, name entrances and statics, Settle, parameter strip and sheet, tier badges and cost dots, Show filters, cost chip, Device budget toggle, scene guard | `SHOW_THEME_V2` | 3 weeks |
| 2b Fonts | Catalog build step, picker, mirror job, per page font links with subsets, variable axes, weight pulse | `SHOW_FONT_CATALOG` | 1 to 2 weeks |
| 3 Showcase | WebGL engine per decision 13 with poster and the shared watchdog, 14 shaders plus the 5 pointer reactive ones, galaxy field, cursor row, liquid glass, electric and star borders, spotlight, magnet, particle text, trail particles, build time thumbnails | `SHOW_THEME_SHOWCASE` | 3 to 4 weeks |
| 4 Looks and sharing | Updates #304's `EditorContext.test.tsx` for the new `applyTheme` and look flow; 10 looks, `ThemeVersion` history and restore, duplicate and rename, `theme.share`, `/t/[slug]`, share dialog, Shared with me, Theme of the week, `User.theme` to int | `SHOW_THEME_SHARING` | 2 weeks |

PRs into `development`, each small enough for Gustavo to review in one sitting: 1a registry; 1b renderer; 1c particles; then one PR per row in phase 2 (Background, Container, Buttons, Hover and press, Name, Scene core, Editor chrome); 2b fonts in two PRs (catalog and picker, delivery); phase 3 one PR per engine plus one per effect family; phase 4 in three PRs (looks and history, share API and page, Themes tab). Rollout of each flag: staging, Rob's handle, all. Old renderers deleted one release after `SHOW_THEME_V2` is on for all.

### 3.14 Tests and acceptance

Tests: registry invariants (3.2); `upgradeTheme` round trip over every v1 id combination against frozen snapshots of the old class maps; `clampParams` and unknown id rejection; theme file v1 and v2 import and export round trip; `theme.share` and `theme.bySlug` (slug uniqueness, revoke 404, no author fields beyond the handle, rate limit); 10 look limit; `ThemeVersion` trim; react-bits refusal on priced themes; font catalog build (schema of `catalog.json`); watchdog thresholds; scene guard ratio math (all on Vitest, per #304); Cypress: a heavy scene paints its poster before the engine chunk loads, Pause motion stops every layer, reduced motion renders still, hover effects do not mount on a touch emulation, the share page applies a look after sign up, no horizontal overflow at 390 on every Design row.

Acceptance:

1. On `development` with `SHOW_THEME_V2` off, every existing creator page renders pixel identical to before phase 1 (Cypress screenshot diff on 12 seeded themes).
2. With the flag on, the editor preview and the public page render the same output for the same theme (one snapshot per registry entry, both apps).
3. Every v1 theme row upgrades on read with no change to what the visitor sees, except the four drift fixes listed in 1b, which match the public page.
4. The editor bundle size does not change in phase 1 and gains no library in any phase; the public page first load grows by at most 10 KB gzip.
5. A heavy scene paints its poster at first paint and the engine chunk loads after; LCP under 2.5 s and INP under 200 ms on the reference phone with Aurora plus Magnet plus Shiny.
6. A weak device (forced through the toggle or the watchdog) renders cursor, overlay and shader layers still, in that order, and logs one event.
7. Every pick updates the preview within 233 ms and autosaves within 800 ms of the last change; Undo returns the previous look.
8. The contrast guard and the scene guard show the measured ratio and a working one tap fix; saving is never blocked.
9. Fonts: the picker searches 1,942 families, tiles render the creator's name, variable axes appear only when the family has them, and the public page loads at most two families with subsets; no request reaches fonts.googleapis.com or fonts.gstatic.com from a visitor's browser.
10. Theme files: v1 files import; v2 files carry the header; locked marketplace themes do not export; a file with a foreign `fileId` imports with the base replaced and a notice.
11. Share links: create, copy, use, save, revoke; a revoked link 404s; the page shows the handle only with credit on; Download appears only when allowed; uses count on use, not view.
12. Looks: 10 per user, Save as new look disabled at the limit with the reason; history holds 20 versions; restore applies and records a version.
13. Compliance scan passes on every effect label, description and the share page; no dashes in shipped copy.
14. Reduced motion, keyboard reachability, 44 px targets and measured contrast hold on every new control; tiles are a radiogroup with roving focus.
15. Typecheck and build pass for `server`, `client`, `landingpage`, `admin`, `@repo/constants` and `@repo/ui`; all tests above pass.

### 3.15 Edits this spec makes elsewhere

- **Motion layer (#26).** Phase 1b moves the hero's inline watchdog and `lowPower()` into `packages/ui/src/motion/watchdog.ts` and `motionState.ts` into `packages/ui/src/motion/`; v2 adds `deviceClass` and `pageCost`. The landing hero imports them unchanged. The creator page Pause motion uses the same `amped.motion.paused` key, so one visitor choice holds across amped.bio.
- **Prism 2.2 rows 023 to 033.** Rows stay shipped. The Background (023), Container (024), Buttons (025), Text (026), hover (028), particles (029), name (030), export and import (031), Themes (032) and theme card (033) rows get a note pointing at the v2 rows 139 to 150 that extend them.
- **App structure v2.** Design tabs stay Themes, Style, Motion. The More design options menu (031) keeps Save theme file and Import theme file and gains Copy share link.
- **Paid themes (#3).** `Theme.price` and the `source` refusal are the hooks; the Amped.Bio branded gateway (payment flow rule 4) and `theme.publishPaid` belong to #3.
- **Content system (#20).** Background photo and video uploads keep using the content system's upload validation (Phase 0 fix #3).
- **Analytics (#11).** Events in 3.12 join the registry.

## Sources

- Repo: amplifydigital-web3/amped-bio-new `development` at 29db7cb, read 2026-10-10 (`packages/constants/src/theme.ts`, `apps/client/src/utils/styles.ts`, `apps/server/src/trpc/theme.ts`, `packages/ui/src/theme.ts`, `apps/client/src/components/panels/design/`, `apps/landingpage/src/components/landing/motion/`)
- PR #291 (public site motion, merged 8 Oct) and open PR #304 (Vitest test suites)
- Overview: docs/overviews/theme-engine-v2.md (libraries, licenses, catalog tiers, competition)
- Prism 2.2 Balanced v1.0 (locked 26 Sep 2026), sections 5 to 17
- Motion layer spec (`docs/features/motion-layer.md`) for the watchdog and the GSAP decision
- Design QA: docs/features/theme-engine-v2-design-qa.md

## Revision log

- 2026-10-10 (plan recheck): `development` unchanged at 29db7cb. The motion layer merged (#290, #291) as raw WebGL with an inline watchdog, so phase 1b now extracts the watchdog, `lowPower()` and `motionState.ts` into `packages/ui/src/motion/`, and the showcase engine is decision 13 (raw WebGL helper recommended, OGL the alternative; registry engine renamed `webgl`). Flags renamed to the `SHOW_` convention. Tests moved to Vitest (open #304) and Cypress; phase 1a lands after #304 and adds Vitest to `packages/constants` and `packages/ui`; phase 4 updates #304's `EditorContext.test.tsx`. Motion tokens are `MOTION` and `PRISM_EASE` from `@repo/ui`.
- 2026-10-10: First spec. Boards 01 to 06 reviewed and fixed, boards 07 to 12 added, all twelve passed the gate. Rob answered the three card decisions with the recommendation; the spec carries them as settled.
