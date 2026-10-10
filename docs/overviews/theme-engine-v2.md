# Theme Engine v2: Overview

Build Board #28. Written 7 Oct 2026. Living copy with comments: https://claude.ai/code/artifact/beb1dc55-a670-4f32-ac7b-60b282d37625. Spec: docs/features/theme-engine-v2.md.

## Summary

The Amped.Bio theme engine works, but it is a fixed menu of 10 button styles, 8 container styles, 10 hover effects, 6 name effects, 8 particle presets and 8 fonts, each defined as a hardcoded Tailwind string and copied by hand into two renderers. v2 turns it into a registry: one shared renderer, one effect catalog in `packages/constants`, layered effects (background scene, container, button, name, cursor) that follow the creator's colors, a 2,000 family font catalog loaded on demand, and versioned theme files that can be shared by link. The effect library grows from about 40 picks to about 150, built on libraries that are MIT licensed and already inside the chosen stack: tsParticles, OGL, CSS and the Web Animations API.

The headline recommendation is to build the registry and shared renderer first (phase 1), because every new effect after that is one file instead of six. The showcase effects (WebGL scenes, text physics, cursor effects) come in phase 3 behind a device budget and a per page kill switch. GSAP stays out of creator effects, as the motion layer decision already holds. No new library enters the editor bundle; the preview renders the same component the public page renders.

The work is sized at four phases. Phase 1 is foundation and removes the known drift bugs. Phases 2 and 3 are catalog growth. Phase 4 is theme sharing and the groundwork for paid themes (#3). Three decisions for Rob close the plan: the effect budget per page, the font catalog source, and whether react-bits components may ship inside sold themes.

## How it works today

A theme is one flat JSON object, `ThemeConfig`, defined with zod in `packages/constants/src/theme.ts`. Most fields are bare integers. Each integer maps to a hardcoded Tailwind class string inside a `get*Style()` function. The code paths below are on the `development` branch of amplifydigital-web3/amped-bio-new.

| Piece | Options today | Where it is defined | Where it renders |
| --- | --- | --- | --- |
| Background | color, CSS gradient string, photo URL, video URL, upload. 4 gradients, 4 colors, about 20 photos and 60 videos on S3 | `apps/client/src/utils/backgrounds.ts` (640 lines) | Fixed layer in `Preview.tsx` and `ProfileView.tsx` |
| Container style | 0 None, 1 Frosted glass, 2 Floating card, 3 Gradient border, 4 Neon glow, 5 Double border, 7 Minimal glass, 9 Modern card. Ids 6 and 8 still render but cannot be picked | `rows/ContainerRow.tsx` (labels), `utils/styles.ts` and `lib/styles.ts` (classes) | `getContainerStyle(id)` plus an inline 8 digit hex for color and opacity |
| Button style | 10 ids: Default, Soft, Outline, Shadow, Glass, Neon, Gradient, Floating, Bordered glow, Minimal | `rows/ButtonsRow.tsx`, both `styles.ts` files | `getButtonBaseStyle(id)` and `CreatorButton` in `blocks/frame.tsx` |
| Button hover effect | 10 ids: None, Scale, Glow, Slide, Bounce, Pulse, Shake, Rotate, Pop, Shine | `rows/MotionRows.tsx` (labels and a third copy called `PLAYING`), both `styles.ts` files | Tailwind `motion-safe:hover:*` classes, 233 ms on the public page |
| Name effect | 6 pickable: None, Glow, Wave, Neon, Rainbow, Glitch. Gradient, Typewriter, Fade in and Slide up still render if saved | `rows/MotionRows.tsx`, both `styles.ts` files, keyframes in 3 CSS files and 2 Tailwind configs | `getHeroEffectStyle(id, paused)` on the h1 only |
| Particles | 8 pickable tsParticles v3 presets: Floating dots, Connecting lines, Snow, Bubbles, Fireflies, Confetti, Stars, Geometric. Matrix retired | `particleConfigs.ts`, byte identical in client and landingpage | `ParticlesBackground.tsx` in each app, engine from `@tsparticles/all` loaded on demand |
| Font | 8 families: Inter, Roboto, Open Sans, Montserrat, Poppins, Playfair Display, Lora, Space Grotesk. 5 sizes | `rows/TextRow.tsx` | One Google Fonts link in `index.html` and `layout.tsx` loads all 10 families on every page |
| Colors | button color, container color, font color, container opacity 0 to 100 | `kit/ColorControl.tsx` | `themeCssVars()` in `packages/ui/src/theme-style.ts` emits `--amped-btn`, `--amped-btn-dark`, `--amped-glow`, `--amped-container`, `--amped-name-glow` |

The editor is `apps/client/src/components/panels/design/`. `DesignPanel.tsx` holds three tabs: Themes, Style and Motion. Style and Motion are disclosure rows (one open at a time) of option tiles. Hover or focus on a tile sets `previewOverride` in `EditorContext`, and the live preview frame merges it in. The preview is `PreviewFrame.tsx`, which renders `Preview.tsx` at phone or desktop size and scales it with CSS. There is no iframe. Autosave fires 800 ms after a change through `trpc.theme.editTheme`.

The gallery merges two sources in `hooks/useCollections.ts`: 51 hardcoded themes in `utils/themes.ts` (abstract, nature, cyber, winter), each only a video background plus a thumbnail, and admin curated server themes from `themeGallery.getCollections`. Applying a hardcoded theme fetches its full config from `apps/client/public/themes/<Name>.ampedtheme` by name. The Rings file is missing, so that theme fails to apply.

Save and download live in `packages/ui/src/theme.ts`. Export writes the bare `ThemeConfig` as pretty JSON to a `.ampedtheme` file. Import validates it with the same zod schema and autosaves with an 8 second Undo. The file has no name, version or schema id. A marketplace theme (`user_id` null) is locked: read only, not exportable, and Make an editable copy stores it as the creator's own row. The database holds one `Theme` row per user in practice, because `applyTheme` with id 0 overwrites the first row it finds. `share_level` and `share_config` exist in Prisma and nothing uses them. There is no price field, no entitlement and no link based sharing.

The tech facts that shape v2: pnpm and Turborepo, React 18.3, Vite 5 in the editor, Next 16 App Router on the public page, Tailwind 3.4 with the Prism 2.2 preset, tRPC 11, Prisma 6.7 on MySQL. tsParticles is at `^3.8.1` in both apps. `framer-motion`, `tsparticles-slim` v2 and `dotlottie-react` are installed and unused. The repo rule in `AGENTS.md` is Tailwind only and shared code in `packages/constants`. No test covers theme code.

## What holds it back

The engine has nine structural limits. Each one caps how far the catalog can grow before it breaks.

| Limit | Evidence in code | Effect on creators |
| --- | --- | --- |
| Two renderers that have already drifted | `apps/client/src/utils/styles.ts` has no focus states and infinite bounce and pulse. `apps/landingpage/src/lib/styles.ts` has 233 ms one shot effects. Hero ids 4 and 5 use `animate-fade-in` and `animate-slide-up` in the editor, which are not defined anywhere | The preview is not what visitors see. Pause motion exists only on the public page |
| No registry | Adding one effect touches about six files in three apps: two class maps, a label array, the `PLAYING` map, keyframes in three CSS files and two Tailwind configs | Every new effect costs a day and risks drift |
| Bare integer ids | `themeConfigSchema` accepts any number. Retired ids 6 and 8 (container), 1, 3, 4, 5 (name) and 6 (particles) still render or render nothing | Imported files can hold effects no one can pick again |
| Effects ignore the theme colors | Particle colors are hardcoded in `particleConfigs.ts`. Neon name is fixed `#ff00ff`. Gradient name is fixed blue to purple | A creator with a warm brand gets cyan particles |
| Keyframes live in CSS files | `animations.css` in client and admin, `globals.css` in landingpage | Breaks the Tailwind only rule in `AGENTS.md` and triples maintenance |
| Fixed font list | 8 families in `TextRow.tsx`. All 10 families in the link load on every page | Creators cannot match their brand font. Every visitor downloads about 10 families |
| Theme file has no identity | `.ampedtheme` is the bare config with no name, version or schema id | Files cannot be migrated, attributed or deduplicated |
| One theme row per user | `applyTheme` id 0 does `findFirst` and overwrites | No saved looks, no history, no A and B |
| Unused sharing fields | `share_level` and `share_config` in Prisma, nothing reads them | No share link, no remix, no credit to the designer |

Two smaller items belong on the fix list regardless of v2. `apps/client/public/themes/Rings.ampedtheme` is missing, so the cyber Rings theme cannot be applied. `EditorContext.updateThemeConfig` and `applyTheme` still log `console.group` debug output with emoji.

Performance today is acceptable but not tuned. `@tsparticles/all` ships about 69 KB gzip as one chunk when any preset is used, where the slim bundle plus one preset would be under 30 KB. The editor runs particles at 120 fps against 60 on the public page. Video backgrounds have no data saver fallback beyond the poster.

## The v2 architecture

v2 replaces the integer maps with one typed registry and one renderer. The registry is the catalog. The renderer is the only code that turns a theme into a page. Both apps import them from the shared packages, so the preview and the public page cannot drift. A theme flows down: the config names effects by id, the registry resolves each id to its definition, the renderer composes the layers, and the two apps mount the same component.

**Effect registry.** A new folder `packages/constants/src/effects/` holds one file per layer: `scenes.ts`, `containers.ts`, `buttons.ts`, `buttonEffects.ts`, `names.ts`, `cursors.ts`, `fonts.ts`. Each entry is one object with a stable string id, a label, a short description, a tier (`core`, `plus`, `showcase`), an engine (`css`, `waapi`, `particles`, `ogl`), a cost class (`still`, `light`, `heavy`), a `colorMode` (`fixed`, `theme`), the Tailwind class or the config factory, and the preview recipe for the editor tile. A derived `EFFECT_IDS` object feeds zod enums, so `themeConfigSchema` rejects unknown ids instead of accepting any integer. Legacy integer ids map to the new string ids in one `legacyMap.ts` and are migrated on read.

**Shared renderer.** `packages/ui/src/creator/CreatorPage.tsx` becomes the one page renderer. It takes `{theme, profile, blocks, mode}` where mode is `edit`, `preview` or `public`. `Preview.tsx` and `ProfileView.tsx` shrink to thin wrappers that pass data and mount the component. This is the D10 item that `docs/prism/batch-08-creator-page.md` lists as pending. v2 depends on it, so it ships first.

**Layered config.** `ThemeConfig` v2 keeps every existing field for compatibility and adds `version: 2` plus an `effects` object with one key per layer: `scene`, `container`, `button`, `buttonEffect`, `name`, `cursor`. Each layer holds `{id, params}`. Params are small and typed per effect (density, speed, intensity, direction, a second color). Every effect reads the creator's colors through the existing `--amped-*` variables, with a `palette` param to override. Particle presets become factories: `(colors, params) => ISourceOptions`, so Fireflies glow in the button color and Snow matches the font color.

**Keyframes as Tailwind.** The three copies of `animations.css` fold into the Prism preset plugin in `packages/ui/src/prism/tailwind-preset.js`, which already registers component classes. That restores the Tailwind only rule and gives both apps the same keyframes from one file.

**Engines on demand.** The registry entry names its engine. CSS and Web Animations effects cost nothing. tsParticles loads the slim bundle plus only the plugins a preset needs (about 25 to 30 KB gzip instead of 69 KB from `@tsparticles/all`). OGL scenes load as their own chunk (about 13 KB for the engine plus 2 to 5 KB per shader) only when a page uses one. Nothing new enters the editor bundle: the editor imports the same lazy chunks the public page does, inside the preview frame only.

**Theme files v2.** `.ampedtheme` gains a header: `{$schema: "amped.bio/theme/2", name, author, createdAt, config}`. Import accepts v1 files and migrates them. Export of a locked marketplace theme stays blocked. A new `theme.share` tRPC procedure creates a short link (`amped.bio/t/<slug>`) that opens the Themes tab with the look previewed and an Apply button. `share_level` and `share_config` in Prisma finally do work. A `ThemeVersion` table keeps the last 20 saves so creators get history and Undo past one session.

**Multiple saved looks.** `applyTheme` with id 0 stops overwriting. The creator keeps up to 10 saved looks in the Themes tab under My looks. `User.theme` becomes a real foreign key to `Theme.id`.

**Device budget.** The renderer reads a per page cost: the sum of the cost classes of the active effects. A page over budget on a weak device (fewer than 4 cores, Save Data, reduced motion, median frame over 28 ms in the first 45 frames) drops heavy layers to their still fallback, in the order cursor, scene, name. This is the same watchdog the motion layer spec defines for the landing hero, so the code is shared.

## Effect catalog v2

The catalog grows from about 40 picks to about 150 across six layers. Every entry below names its engine and its cost class, because those two facts decide bundle size and the device budget. Tier `core` ships in phase 2, `plus` in phase 2b and `showcase` in phase 3. Items marked "keep" exist today and move into the registry unchanged.

### Scenes: backgrounds and particles

The background and the particles merge into one Scene layer with up to two slots: a base (color, gradient, photo, video, shader) and an overlay (particles). Today particles already sit on top of any background, so this only names what exists and adds the shader base.

| Scene | Engine | Cost | Tier | Source or technique |
| --- | --- | --- | --- | --- |
| Color, gradient, photo, video | CSS | still | core | keep |
| Mesh gradient (4 color blobs that drift) | CSS | light | core | 4 radial gradients animated with `@property` and keyframes, 0 KB |
| Animated gradient (angle sweep) | CSS | light | core | `@property --angle` conic or linear gradient |
| Grain, dot grid, scanlines, noise overlay | CSS | still | core | SVG `feTurbulence` data URI or repeating gradients |
| Floating dots, Links, Snow, Bubbles, Fireflies, Confetti, Stars, Geometric | tsParticles | light | core | keep, converted to color aware factories |
| Fire, Fountain, Fireworks, Meteors, Hyperspace, Sea anemone, Triangles, Squares, Big circles, Ambient | tsParticles | light | plus | official presets, one npm package each |
| Emoji rain, Hearts, Leaves, Petals, Coins | tsParticles | light | plus | `shape-emoji` and `shape-image` plugins with the creator's own uploads |
| Magnetic dots (repel on hover), Attract, Bubble on hover | tsParticles | light | plus | `interaction-external-attract`, `-repulse`, `-bubble` |
| Trail particles (comet tails) | tsParticles | heavy | showcase | `effect-trail` plugin |
| Aurora, Silk, Iridescence, Liquid chrome, Plasma, Galaxy, Threads, Lightning, Orb, Dark veil, Grainient, Light rays, Dot field, Ripple grid | OGL shader | heavy | showcase | react-bits Backgrounds, 2 to 5 KB each on OGL |
| Ferrofluid, Molten metal, Topography, Faulty terminal, Letter glitch | OGL shader | heavy | showcase | react-bits, pointer reactive |
| Galaxy field (50k to 200k GPU point sprites) | OGL | heavy | showcase | Amped authored, under 3 KB GLSL (added at Rob's request) |

The gradient and photo libraries also grow. Today `backgrounds.ts` holds 4 gradients. v2 ships 40 curated gradients as data, grouped by mood, and a gradient builder (2 to 4 stops, angle, mesh toggle) so the creator can match any brand.

### Containers

| Container | Engine | Tier | Technique |
| --- | --- | --- | --- |
| None, Frosted glass, Floating card, Gradient border, Neon glow, Double border, Minimal glass, Modern card | CSS | core | keep |
| Liquid glass (Apple style refraction) | CSS plus SVG filter | plus | `backdrop-filter` with an SVG displacement map, falls back to Frosted |
| Animated gradient border (conic sweep) | CSS | plus | `@property --angle` on a pseudo element, matches the Gradient button |
| Electric border | CSS plus SVG filter | showcase | react-bits ElectricBorder, `feTurbulence` displaced stroke |
| Star border (orbiting light) | CSS | plus | react-bits StarBorder, two moving gradients clipped to the edge |
| Spotlight card (light follows pointer) | CSS plus 10 lines of JS | plus | react-bits SpotlightCard, radial gradient at pointer position |
| Glare hover (sheen sweep) | CSS | plus | react-bits GlareHover |
| Tilt card (3D parallax on hover) | WAAPI | showcase | react-bits TiltedCard logic without Motion, fine pointers only |
| Shapes: Pill, Squircle, Cut corners, Ticket, Arch (today's hidden id 8), Blob | CSS | core | `clip-path` and `border-radius`, one Shape sub control on every container |
| Border styles: none, hairline, thick, dashed, gradient, glow | CSS | core | a Border sub control, independent of the surface |

Shape and border become sub controls rather than new container ids. That is how 8 surfaces, 6 shapes and 6 borders yield 288 combinations without 288 entries.

### Buttons and hover effects

| Button style | Engine | Tier | Technique |
| --- | --- | --- | --- |
| Default, Soft, Outline, Shadow, Glass, Neon, Gradient, Floating, Bordered glow, Minimal | CSS | core | keep |
| Hard shadow (brutalist offset) | CSS | core | `box-shadow: 4px 4px 0` in the dark button color |
| Pill with icon slot, Split (label plus chevron), Ticket edge | CSS | core | layout variants in `CreatorButton` |
| Specular (light rim that follows the pointer) | CSS plus JS | plus | react-bits SpecularButton logic |
| Liquid glass button | CSS plus SVG filter | plus | same filter as the container |
| Gradient border button, Animated gradient fill | CSS | plus | `@property` sweep |

| Hover effect | Engine | Tier | Technique |
| --- | --- | --- | --- |
| Scale, Glow, Slide, Bounce, Pulse, Shake, Rotate, Pop, Shine | CSS | core | keep, with the 233 ms one shot timing on both renderers |
| Magnet (button leans toward the pointer) | WAAPI | plus | react-bits Magnet, transform only, fine pointers |
| Fill sweep (color wipes left to right), Underline grow, Border draw | CSS | core | pseudo element transitions |
| Ripple on press | WAAPI | core | one expanding circle at the press point |
| Click spark (lines burst from the press point) | Canvas | plus | react-bits ClickSpark, no library |
| Lift and tilt (3D) | CSS | plus | `perspective` plus `rotateX` on hover |
| Jelly (squash and stretch) | WAAPI | plus | scale keyframes, 377 ms |
| Icon slide, Arrow nudge | CSS | core | child transform on hover |

Press effects are a new slot. Today only hover exists. Ripple, spark and jelly fire on `pointerdown`, which also makes touch users feel the effect for the first time.

### Name effects

| Name effect | Engine | Tier | Technique |
| --- | --- | --- | --- |
| Glow, Wave, Neon, Rainbow, Glitch | CSS | core | keep, Neon and Rainbow read the theme colors |
| Gradient (returns), Shiny text (sheen sweep) | CSS | core | `bg-clip-text` with `@property` animation |
| Blur in, Split reveal (letters rise one by one), Decrypt (characters settle), Typewriter (fixed) | WAAPI | core | one shot entrances, 610 ms, play once per visit |
| Outline (stroke only), Shadow stack (3D layered), Chrome (metal gradient) | CSS | core | `-webkit-text-stroke`, stacked `text-shadow` |
| Variable weight pulse (TextPressure) | CSS plus JS | plus | needs a variable font, weight follows pointer distance |
| Fuzzy text (edge noise) | Canvas | plus | react-bits FuzzyText, no library |
| Rotating words (name, then tagline) | WAAPI | plus | a second line the creator sets |
| Circular text badge | CSS | plus | react-bits CircularText |
| Depth parallax (layers move with pointer) | WAAPI | showcase | fine pointers only |
| Particle text (name forms from particles) | tsParticles | showcase | `polygon-mask` plugin on the name's path |

Every looping name effect gets a `loop: once | always` param so the creator can choose an entrance that settles. The public page already pauses looping effects behind Pause motion, and that control stays.

### Cursor effects (new layer)

Cursor effects are the single most requested "premium" look on creator sites and cost nothing on touch devices because they do not render there. All are fine pointer only and pass the still fallback.

| Cursor effect | Engine | Tier | Technique |
| --- | --- | --- | --- |
| Glow follower, Ring follower | CSS plus JS | plus | one element tracks `pointermove` with lerp |
| Spark trail, Pixel trail, Dot trail | Canvas | plus | react-bits PixelTrail logic, no library |
| Blob cursor | OGL | showcase | react-bits BlobCursor without GSAP, metaball shader |
| Splash cursor (fluid) | WebGL | showcase | react-bits SplashCursor, fluid simulation, heaviest item in the catalog |

### Fonts

The 8 family list becomes the full Google Fonts catalog: 1,942 families, 553 of them variable, all under the SIL Open Font License or Apache. The catalog ships as a static JSON generated from the Google Fonts Developer API at build time (family, category, axes, popularity), about 60 KB gzip, loaded when the Text row opens. The picker gets search, categories (sans, serif, display, handwriting, mono), a Popular shelf and a Pairings shelf (name font plus body font). Weight and italics become real controls, and variable fonts expose their axes (weight slider, width, optical size) which also powers the TextPressure name effect.

Loading changes from one link for all pages to one `<link>` per page built from the creator's two families, with `text=` subsetting on the name font so the hero font costs a few KB. Fallbacks use `size-adjust` metrics so the page does not jump when the font arrives. The 10 family link in `index.html` and `layout.tsx` goes away, and Figtree and Bebas Neue load through the Prism preset only.

## Libraries and licenses

Every engine in v2 is MIT licensed or native, except one source of components that carries a Commons Clause. Versions and weights are as published on npm on 2026-10-07.

| Library | Version | License | Weight (gzip) | Verdict for creator effects |
| --- | --- | --- | --- | --- |
| tsParticles | 4.4.0 (Amped is on 3.8.1) | MIT | slim bundle about 25 KB plus 1 to 3 KB per plugin | Yes. Upgrade to v4 for the paint system (fill plus stroke arrays), 100 palette packages, OffscreenCanvas and the trail, zoom and blend plugins |
| OGL | 1.0.11 | MIT | 12.8 KB for the subset in use | Yes. Already the chosen WebGL engine in the motion layer spec. Powers 30 of the react-bits background shaders |
| CSS, `@property`, Web Animations API, View Transitions | native | browser | 0 | Yes. First choice for every container, button and name effect |
| react-bits | 200 plus components, 47k stars | MIT plus Commons Clause | per component | Yes for use inside Amped. Counsel confirms before any component ships inside a sold theme (below) |
| Motion (framer-motion) | 14.0.0 | MIT | 28.5 to 42 KB | No. Already rejected for the editor in the motion layer decision 1. Every react-bits text effect that uses Motion can be rewritten on WAAPI in under 50 lines |
| GSAP | 3.15.0 | Free, with a competitor clause | 28.3 KB | No. The license prohibits use in a "software, tool, or service that enables users to create, edit, or manage animations through a visual interface or builder". The Design Motion tab is that tool. Motion layer decision 2 stands |
| Three.js | 0.186.1 | MIT | 150 KB plus | No. OGL does every 2D shader in the catalog at a tenth of the size. Revisit only for a true 3D scene |
| Vanta.js | 0.5.24 | MIT | depends on Three.js | No, for the same reason. Its looks (waves, fog, birds, net) are reproducible on OGL |
| matter-js (physics) | 0.20.0 | MIT | 25 KB | Not in v2. Falling text and physics folders are novelty, and the budget is better spent on shaders |
| Google Fonts catalog | 1,942 families, 553 variable (August 2026) | SIL OFL 1.1 and Apache | per family | Yes. Self hosting through Fontsource is the EU privacy option if counsel wants no Google Fonts requests before consent |

**react-bits and the Commons Clause.** The license allows use "as part of an application, website, or product" for any commercial purpose, so long as Amped does "not sell, sublicense, or redistribute the components themselves". Using Aurora as a scene option is use inside a product. Selling a paid theme (#3) whose value is mostly one react-bits shader is closer to selling the component. Two safe paths: ship react-bits derived effects as free `core` and `plus` options and keep paid themes to Amped authored effects, or rewrite the shaders Amped wants to sell (most are under 80 lines of GLSL) so the code is Amped's own. This is decision 3 for Rob and counsel.

**GSAP.** The standard license (effective April 30, 2025) is free for commercial use including all plugins. The prohibited use is a visual animation builder that competes with Webflow. A creator picking a hover effect from a tile grid is a visual interface for managing animations. The existing decision keeps GSAP on Amped's own marketing pages and out of anything a creator selects. Nothing in v2 needs it: every react-bits effect that imports GSAP is either rewritten on WAAPI or left out.

**tsParticles v4 migration.** Breaking changes are limited: `particles.color` becomes `particles.paint.fill`, `particles.stroke` becomes `particles.paint.stroke`, and backgroundMask, responsive and themes move to optional plugins. The 9 existing presets migrate in one file because they become factories anyway. The React wrapper `@tsparticles/react` is at 4.4.0 too.

**Font delivery and privacy.** Loading from `fonts.googleapis.com` sends the visitor's IP to Google. German courts have ruled against this without consent (LG München, 2022). Amped already runs Google Consent Mode for analytics. The clean option is self hosting the chosen families through Fontsource packages or a build step that mirrors the needed subsets to Amped's own CDN. The catalog JSON stays the same either way, so this is a delivery decision, not a design one. Decision 2 for Rob.

## Editor UI design

The Design panel keeps its three tabs and its Prism 2.2 pieces (disclosure rows, option tiles, color control, contrast guard, locked theme notice). v2 changes what the tiles show, adds a parameter strip under the selected tile, adds a Layers summary, and makes the preview honest. Every screen goes through the Screen Review process (UI design, then the Prism 2.2 gate) before build; the boards are on the Theme Engine v2 design canvas and the spec lists them.

**Themes tab.** Three shelves replace the flat collection list: My looks (up to 10 saved looks with Duplicate, Rename, Share link, Export), Collections (the curated gallery, now with filter chips by mood and by cost, so a creator on a phone can hide heavy looks), and Shared with me (looks opened from a share link). The current theme card gains a Layers line that reads the registry. Tapping a layer jumps to its row.

**Style tab.** The rows stay Background, Container, Buttons, Text. Container and Buttons each get a Shape and a Border sub control under the surface grid, as chip groups, so the surface grid stays small. Text gets the full font catalog: a search field, category chips, a Popular shelf, a Pairings shelf, then weight and italics controls, with axis sliders when the family is variable. Font tiles render the creator's own name in the face so the choice is judged on the real text.

**Motion tab.** Rows become Scene, Button hover, Button press, Name, Cursor. Each row is an option grid as today, with three additions. A tier badge on tiles (Plus, Showcase) and a cost dot (light, heavy) tell the creator what a pick costs before they tap. A parameter strip appears under the selected tile with two to four controls per effect. A Settle control on looping effects offers Loop or Play once.

**Tiles that play.** v2 derives every tile preview from the registry entry's `preview` recipe, so the tile and the page cannot differ. Heavy tiles (OGL scenes, cursor effects) show a 2 second looping video thumbnail generated at build time rather than mounting a WebGL context per tile. One live instance at a time stays the rule.

**Preview frame.** The frame mounts the shared `CreatorPage` in `preview` mode, so what the creator sees is the public render. Three controls join the phone and desktop toggle: Pause motion (the same control visitors get), a Device budget toggle (Strong, Typical, Weak) that shows what a weak phone will render, and a Visitor view that hides the editor only affordances. A chip above the frame reads the page cost.

**Contrast and readability.** The existing guard stays (4.5:1 on cards and buttons, 3:1 on the name with an effect). v2 adds a readability check for scenes: when a shader or particle scene runs behind text with no container surface, the guard measures contrast against a sampled frame and offers Add a surface as the one fix.

**Theme files and sharing.** The overflow menu keeps Save theme file and Import theme file. It adds Copy share link, which calls `theme.share` and copies `amped.bio/t/<slug>`. Opening a share link lands on the Themes tab with the look previewed, its author credited, and Apply or Save to My looks. Share links can be revoked. Imported and shared looks always carry their effect ids, never code, so a theme file cannot run anything.

**Phone layout.** Rows stay full width. The parameter strip becomes a bottom sheet. The font picker opens as a full height sheet with the search field pinned at the top. Tier badges and cost dots stay visible at 390 wide.

**Copy rules.** Effects are named for what the eye sees (Aurora, Magnet, Shiny), never for the library. Cost words are Light and Heavy. Tier words are Plus and Showcase. No effect copy mentions tokens, rewards or rates.

## Competition and marketing

No link in bio product treats visual effects as a layered system. They sell a fixed set of looks and gate the better ones behind a plan. That is the gap v2 fills: Amped becomes the only bio page where the creator composes the scene, the surface, the type and the motion, and the result follows their brand colors everywhere.

| Product | What creators get | Where v2 goes past it |
| --- | --- | --- |
| Linktree | Theme gallery, a custom theme on paid plans, a handful of fonts and button shapes, animated backgrounds on Pro (introduced March 2021, two options) | Full font catalog, parameterized effects, cursor and press layers, share links, no paywall on core looks |
| Beacons | Template packs and blocks, limited fonts, backgrounds by upload | Shader scenes, name effects, device budget |
| Bento | A fixed grid, few visual options by design | Not a direct competitor on looks; different positioning |
| Carrd and Framer | Full freedom, but a page builder with a learning curve | Amped keeps a guided tile picker and still reaches showcase quality |

**Positioning.** "Your page, your look, down to the pixel." The proof points are the three things no competitor offers together: a 2,000 family font catalog, effects that follow your colors, and showcase scenes that look like an agency site. The marketing surface is the gallery itself: every collection page on amped.bio is public and indexable, each theme has its own share URL with a live preview, and a creator can post their share link as content.

**Growth loops.** Share links credit the author and carry a Make it yours button, which is a referral path with no reward language (no compliance exposure). A Theme of the week on the landing page and in the editor's Themes tab features a creator's look with their handle. Theme files remain portable so creators can trade them in Discord and Telegram, which Linktree does not allow.

**Paid themes (#3).** v2 builds the shelf that paid themes sell on: saved looks, share links, author credit, and a `tier` field on every effect. When payments return, a sold theme is a `Theme` row with a price and an entitlement check in the registry, nothing more. The effect catalog itself stays free so the free product looks premium, and paid themes sell curation and exclusivity, not access to effects.

## Guardrails

**Compliance.** Effects never touch money or token surfaces. The registry refuses to render a scene, cursor or name effect inside any pool block, stake flow or wallet view, which keeps the motion layer's Prism 15 and 17 rules intact. No effect copy, tile label or tooltip uses the banned words from the gating, broadcast and explorer lists. Share links and author credit carry no reward. GSAP stays out of creator effects. react-bits derived effects stay out of sold themes until counsel clears the Commons Clause question. Font delivery before consent is decided with counsel (decision 2).

**Performance budget.** The public creator page keeps its targets: LCP under 2.5 s and INP under 200 ms on a Lighthouse mobile run. Every scene paints a still poster first and loads its engine after first paint. The per page budget is 1 heavy effect, or 3 light effects, before the weak device fallback engages. The editor bundle gains no library; lazy chunks load inside the preview frame only. A size check fails the build if the public page's first load grows by more than 10 KB gzip from this baseline.

**Accessibility.** `prefers-reduced-motion` renders every effect still, as today. Pause motion stays on every page with a looping effect and now also stops cursor and scene effects. Cursor effects never replace the system cursor and never hide focus rings. Every button and name effect moves only transform, opacity, shadow or filter, so layout never shifts and text stays selectable. The contrast guard runs on every pick, and scene readability adds a measured check. Tiles keep the radiogroup pattern with roving focus, and tier badges and cost dots carry text, not color alone.

**Security.** Theme files and share links carry effect ids and parameters only. The registry resolves ids; no theme can inject classes, CSS or code. Parameters are clamped by zod ranges on the server in `theme.editTheme`, which also drops any unknown id. The admin `config: z.any()` and `schemas/theme.schema.ts` are replaced by the shared v2 schema so every write path validates the same way.

**Testing.** v2 adds the first theme tests: a round trip test for v1 and v2 theme files, a snapshot per registry entry for both renderers (one renderer makes this one snapshot), a schema rejection test for unknown ids, and a Playwright check that the public page with a heavy scene paints the poster before the engine loads.

## Build plan

Four phases. Phase 1 is the foundation and pays for itself by removing the drift bugs. Each later phase is additive and can ship on its own. Estimates are for one developer who knows the codebase (Gustavo), with Rob reviewing screens through the Screen Review process. The spec (section 3.13) breaks these into PRs and flags.

| Phase | What ships | Depends on | Size |
| --- | --- | --- | --- |
| 1 Foundation | Registry, string ids with legacy map, zod enums, shared `CreatorPage`, keyframes moved into the Prism preset, color aware particle factories, tsParticles v4 on the slim bundle, theme file v2 header with v1 import, dead dependencies removed, Rings file restored, debug logging removed, first tests | Prism 2.2 rollout (#20) merged for the Design screens | 2 to 3 weeks |
| 2 Core catalog | Shape and border sub controls, mesh and animated gradients, 40 gradients, 10 official particle presets, new CSS button styles, fill and ripple and press effects, name entrances, Settle control, parameter strip, tier badges and cost dots | Phase 1 | 3 weeks |
| 2b Fonts | Catalog JSON build step, picker with search and shelves, per page font link with subsetting, variable axes, delivery per decision 2 | Phase 1, decision 2 | 1 to 2 weeks |
| 3 Showcase | OGL scene engine with poster and watchdog, shaders, galaxy field, cursor layer, Liquid glass, Electric and Star borders, Magnet and Spotlight, particle text, device budget toggle in the preview | Phase 2, motion layer phase 2 (shares the watchdog) | 3 to 4 weeks |
| 4 Sharing and looks | My looks (10 saved), `ThemeVersion` history, `theme.share` and `amped.bio/t/<slug>`, author credit, Theme of the week, `User.theme` foreign key | Phase 1, counsel on react-bits in sold themes | 2 weeks |

**Transition (Rob, 7 Oct).** Not a standalone system. Wrap today's effects in the registry with a legacy id map (no pixel change, snapshot tested), ship the shared renderer beside the old two behind `THEME_ENGINE_V2` (staging all, then Rob's handle, then all), read v1 rows forever and write v2 on next save, additive database changes only, delete old renderers one release after full rollout. No long lived v2 branch.

**Decisions for Rob.**

1. Effect budget per page. Recommended: 1 heavy or 3 light effects before the weak device fallback. Alternative: no budget, let creators stack everything. Why not: a bio page is opened on phones from social apps, and a stacked page would fail the LCP target.
2. Font delivery. Recommended: self host the chosen families on Amped's CDN through Fontsource with a build step, no request to Google before consent. Alternative: keep the Google Fonts link. Why not: EU consent exposure already handled for analytics would reopen for fonts.
3. react-bits in sold themes. Recommended: ship react-bits derived effects as free core and plus options, and rewrite any shader Amped wants inside a paid theme as Amped's own GLSL. Alternative: ask the author for a commercial exception. Why not: slower and depends on one person.

## Sources

- Repo: amplifydigital-web3/amped-bio-new on `development`, read 2026-10-07
- GSAP Standard License, effective April 30, 2025: https://gsap.com/community/standard-license/
- react-bits, MIT plus Commons Clause: https://github.com/DavidHDev/react-bits
- tsParticles v4 announcement (May 18, 2026) and the presets catalog: https://particles.js.org/demos/presets
- Google Fonts family and variable counts, August 2026
- Linktree customization post, March 2, 2021: https://linktr.ee/blog/customization-features-for-your-linktree
- npm registry versions read 2026-10-07: tsparticles 4.4.0, ogl 1.0.11, motion 14.0.0, gsap 3.15.0, three 0.186.1, vanta 0.5.24
