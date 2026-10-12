# Premium motion layer

Status: v3, decided and in build. Rob took #26 off hold on 2026-10-07 ("go ahead and do #26"). Editor motion (phases 1 and 3) is in PR feat/motion-editor. Public site motion (phase 2) is in PR feat/motion-public behind `NEXT_PUBLIC_SHOW_MOTION`, on for staging and off in production until counsel clears the items in 3.8. Build Board item #26.
Owner: Rob Frasca. Drafted by Claude, 2026-10-04.
Depends on: Prism 2.2 UI rollout (Build Board #20). Motion animates the screens that rollout delivers.
Prototype: Amped Motion Lab, https://claude.ai/artifact/B5P8pvSWzAph7Y6uAyS6MV
Design QA: docs/features/motion-layer-design-qa.md

## 1. Research

### Current code (development at 278c04a1)

- Prism motion is CSS only. Section 14 of Prism 2.2: 89 ms micro, 144 ms hover light, 233 ms control, 377 ms panel and rim travel, 610 ms room. One easing, `cubic-bezier(0.2, 0, 0, 1)`. No bounce.
- The tokens already exist in code. `packages/ui/src/prism/tailwind-preset.js` exports `prismMotion`, which gives the classes `duration-prism-micro`, `-hover`, `-control`, `-panel`, `-room` and `ease-prism`.
- `framer-motion` is in the client and landing `package.json` and is imported nowhere.
- `tsparticles-slim` (v2) is in the client `package.json` and is imported nowhere.
- `App.tsx` called `loadAll` from `@tsparticles/all` at editor start. Fixed in this PR (phase 0). The entry chunk drops from 1,356,332 to 1,286,590 bytes gzip. The presets now load in their own chunk of about 69 KB gzip, only when a page uses particles.
- `@lottiefiles/dotlottie-react` is used only by `PayDialog`, which PR #262 removes.
- `react-router` is ^7.11 in the client. Its `viewTransition` option wraps navigation in `document.startViewTransition`. Same-document View Transitions are Baseline since October 2025.
- `BottomSheet` is a Radix Dialog with a Prism CSS slide. It has no drag to dismiss.
- The landing hero says "Each profile doubles as your wallet and hub for staking into Reward Pools" (`apps/landingpage/src/app/page.tsx:55`). This is compliance copy, outside motion scope. Flagged in section 3.8.

### Libraries, measured

Weights are gzip, measured from the published packages on 2026-10-04.

| Library | Version | Weight | License | v2 verdict |
| --- | --- | --- | --- | --- |
| GSAP core | 3.15.0 | 28.3 KB | Free for commercial use, plugins included. Prohibited: no-code animation builders that compete with Webflow | Public site |
| ScrollTrigger | 3.15.0 | 18.0 KB | Same | Public site |
| SplitText | 3.15.0 | 3.7 KB | Same | Public site |
| Lenis | 1.3.26 | 5.4 KB | MIT | Public site, fine pointers only |
| OGL (subset used) | 1.0.11 | 12.8 KB | MIT | One hero shader |
| Rive canvas-lite | 2.44.0 | about 477 KB (370 KB wasm, 108 KB JS) | MIT runtime, paid editor seat | Not used. See decision 4 |
| Motion (framer-motion) | 14.0.0 | 42.1 KB (`motion`, `AnimatePresence`); 28.5 KB with `LazyMotion` | MIT | Not used. See decision 1 |
| View Transitions | native | 0 | Browser | Editor and public routes |
| CSS scroll timelines | native | 0 | Browser | Simple reveals |
| Web Animations API | native | 0 | Browser | Editor moments |

Public site total: 68.2 KB gzip, loaded after LCP. CustomEase (3.7 KB) is left out. Editor total: 0 KB.

## 2. Decisions

Decisions 2 and 3 stand as approved. Decisions 1 and 4 are revised. Decisions 5 and 6 are new. All six accepted by Rob (2026-10-07); decision 5 took the alternative.

1. **Placement (revised).** The public site gets scroll storytelling: GSAP, Lenis and the OGL hero. The editor gets native View Transitions, Prism CSS and Web Animations. No animation library enters the editor. Creator pages and money flows get none of it. Reason: every editor moment in section 3.4 runs natively at 0 KB. Motion would add 28.5 to 42.1 KB gzip, mostly for springs and gestures Prism does not use. Lenis breaks nested panels, sheets and inputs.
2. **GSAP scope.** GSAP powers only Amped's own pages. It never powers creator-selectable effects in Design. Reason: the no-charge license prohibits use in no-code animation builders that compete with Webflow, and the Design Motion tab is close to that line. Counsel confirms before the public site work ships.
3. **WebGL engine.** OGL, not Three.js, for the hero shader.
4. **Vector engine (revised).** SVG with Web Animations for the success moment, Follow and empty states. No Rive. Reason: the Rive runtime is 477 KB gzip, larger than all public site motion combined, for moments SVG draws at 0 KB. The prototype draws the success moment in 610 ms with no library. Revisit Rive only if Amped adopts a character or mascot with many states. dotLottie is retired after #262.
5. **Network totals (decided: alternative).** Rob chose to count up the non-token totals only: the number of pools and the number of stakers count up once when they enter the screen. Token figures (amounts, balances, Pool total, rewards) never move. The first recommendation (every figure still) was not taken.
6. **Phone hero (new, for Rob).** The phone hero plays a slow ambient drift. No device tilt. Reason: iOS asks for motion permission before tilt works. A permission prompt on a landing page costs trust and conversions. Alternative: tilt after a tap with the iOS prompt. Not recommended.

## 3. Detailed spec

### 3.1 Surfaces

| Surface | App | Allowed | Never |
| --- | --- | --- | --- |
| Landing `/`, How it works, pools directory hero | `apps/landingpage` | GSAP, ScrollTrigger, SplitText, Lenis, OGL, View Transitions, CSS scroll timelines | Motion on token figures |
| Editor (all destinations) | `apps/client` | View Transitions, Prism CSS, Web Animations, SVG | Lenis, GSAP, WebGL, any animation library |
| Creator pages `/<handle>` | `apps/landingpage` | Existing creator effects only | Any library in this spec on creator content (Prism 17) |
| Money flows (stake, unstake, claim, send, create pool) | both | Prism CSS motion only | GSAP, WebGL, celebration in Review or Commit (Prism 15) |
| Auth cards, OAuth screens | `apps/landingpage` | Prism CSS motion only | Scroll effects |

The pools directory hero lives at `/i/pools` until Creator Pool Explorer (#9) moves it.

### 3.2 Motion tokens

Prism section 14 stays the source. `packages/ui/src/prism/motion.ts` re-exports the values from `prismMotion` in the Tailwind preset. It never defines its own numbers.

| Token | Value | Use |
| --- | --- | --- |
| `micro` | 89 ms | press, checkbox |
| `hover` | 144 ms | ILLUMINATED |
| `control` | 233 ms | toasts, chips, menus, Follow label |
| `panel` | 377 ms | sheets, side panels, rim travel, headline lines |
| `room` | 610 ms | destination change, canvas fade |
| `story` | scroll linked | public site only |
| `ease` | `cubic-bezier(0.2, 0, 0, 1)` | all eased motion |

No bounce, overshoot or spring anywhere. `motion.ts` exports a 10-line cubic-bezier function, and GSAP registers it with `gsap.registerEase("prism", ...)`. CustomEase is not loaded: it would add 3.7 KB gzip and break the 70 KB budget.

### 3.3 Public site choreography

1. **Hero.** A CSS poster of three Prism beams paints first and is the LCP element. The OGL shader loads after first paint and fades in over 610 ms. On fine pointers the beams bend toward the pointer. On touch they drift slowly (decision 6). Headline lines reveal with SplitText: mask lines, 377 ms each, 55 ms stagger, then revert to plain text.
2. **Hero guards.** Device pixel ratio capped at 1.5. Paused when off screen or the tab is hidden. Poster only under reduced motion, Save-Data, fewer than 4 cores, or under 4 GB memory. A frame watchdog measures the first 45 visible frames. If the median frame is over 28 ms, the canvas is removed and the poster stays.
3. **How it works.** One pinned ScrollTrigger sequence in four beats: claim a page, design it, fans follow, members join a pool. Pin on wide screens only (1024 and up), scrub 0.6, about 2,400 px of scroll. The pool beat shows mechanics only: wallet to pool contract to members-only link. No amounts, rates or outcomes. Counsel reviews this beat.
4. **Pools directory.** Pools and stakers count up once on enter (decision 5); token totals are static. Cards rise 13 px and fade on enter with `animation-timeline: view()`. No script.
5. **Lenis.** Fine pointers only. Off on touch, off under reduced motion, stopped while any dialog or sheet is open. Anchor links and keyboard scrolling keep working.

### 3.4 Editor choreography

| Moment | Engine | Behavior |
| --- | --- | --- |
| Destination change (rail, dock, More sheet) | `document.startViewTransition` from the shell navigation (`roomTransition` in `motion.ts`; BrowserRouter has no `viewTransition` option) | 610 ms room crossfade. The top bar title morphs (`view-transition-name: panel-title`). Instant under reduced motion |
| Bottom sheet | Radix Dialog plus a small pointer hook in `@repo/ui` | 377 ms slide. Drag down to dismiss past 30% of its height or above 0.6 px per ms. Escape and the scrim close it. Focus returns to the trigger |
| Side panel | Prism CSS | 377 ms slide |
| Block list add, delete | View Transitions on the list | 233 ms. Undo plays the reverse. Reorder keeps dnd-kit's own animation |
| Toast | Prism CSS | 233 ms in, 144 ms out |
| Follow and Following (creator frame) | CSS plus Web Animations | Label crossfade 233 ms. A pending follow pulses its dot once |
| Setup checklist complete (Home) | SVG plus Web Animations | Prism success moment: the rim draws a full circle in 377 ms, then the check draws in 233 ms. Plays once |
| Pool created (result step) | Same success moment | Shown on the result step only, never on Review |
| Empty states (People, Following, Analytics) | SVG plus CSS | One slow idle loop, paused off screen and under reduced motion |
| First-follow sheet | Prism CSS | Rows stagger 55 ms |
| Rail lens | Prism CSS transition | One lens glides to the new destination in 377 ms |
| Dock lens | Prism CSS transition | The new lens rises and the old one settles in 377 ms |
| Tabs | Prism CSS transition | The selected lens glides between tabs in 377 ms; the new content fades in over 233 ms. No View Transition, so the tab bar never flickers |
| Buttons | Prism CSS | Press moves 1 down in 89 ms |
| Openable cards (pool cards) | Prism CSS | Rise 3 on hover in 144 ms |
| Lists and grids on load (Home columns, Explore pools, Wallet RNS) | Prism CSS | Children rise 13 and fade in, 55 ms apart. Never on wallet or pool stat figures |
| Setup checklist row | SVG plus Web Animations | A step finished during the visit draws its check in 233 ms |

The success moment and its states live in `packages/ui/src/prism/moments/`. Each moment is an SVG component under 4 KB. Script helpers live in `packages/ui/src/prism/motion.ts`; durations and the easing live in `packages/ui/src/prism/motion-tokens.js`, read by both the Tailwind preset and `motion.ts`. Transition names go on only while a View Transition runs, because a permanent `view-transition-name` makes its element a backdrop root and would stop Prism glass inside it from blurring.

### 3.5 Phones and desktop

- Every sequence has a 390 design and a 1440 design. GSAP uses `gsap.matchMedia()` with breakpoints at 640 and 1024.
- How it works stacks on phones. No pin under 1024.
- Touch targets and focus order never depend on animation state.

### 3.6 Performance budget

| Metric | Target | Where |
| --- | --- | --- |
| LCP | under 2.5 s on a mid-range phone (Moto G Power class, 4G) | landing, pools, creator pages |
| INP | under 200 ms | everywhere |
| CLS | under 0.1 | everywhere |
| Animation JS | public site 70 KB gzip or less, loaded after LCP. Editor adds 0 KB | both apps |
| Frame rate | no long task over 50 ms during scroll | public site |

Every library loads by dynamic import on the route that uses it. Lighthouse CI runs on the landing page, a creator page and the editor Home. It is blocked until GitHub Actions billing is restored (Build Board ws-ci-pipeline). Until then the budget is checked by hand on each PR with a Lighthouse mobile run.

### 3.7 Accessibility

- `prefers-reduced-motion`: no pin, no Lenis, no WebGL (poster only), moments show their end state, View Transitions are instant.
- A Pause motion control on the landing page, like the one on creator pages (041 I02).
- No content is reachable only by scrolling an animation. Every beat in the pinned sequence is plain text in the DOM, in order.
- SplitText uses `aria: "auto"` and reverts to the original text after the reveal.

### 3.8 Compliance

- GSAP stays out of the creator Design Motion tab and any creator-selectable effect (decision 2). Counsel confirms the scope before public site work ships.
- Trust rule: no spectacle in Review or Commit. Success moments play on result steps only.
- The How it works pool beat describes mechanics only. No amounts, rates, returns or growth. Banned words from the gating, broadcast and explorer lists apply to all animated copy.
- No count-up or motion on token amounts, balances, token totals or rewards anywhere. Only the pool and staker counts may count up (decision 5). Wallet and pool stat figures do not take part in entrance staggers.
- The current landing hero copy "hub for staking into Reward Pools" goes to counsel with the How it works beat. Motion work does not ship around it.

### 3.9 Phases

| Phase | Scope | Gate |
| --- | --- | --- |
| 0, quick wins | Particles load on first use, not at editor start. Merged in #272 | None |
| 1, editor foundation | `motion.ts` from the preset. View Transitions on destination change. Sheet drag hook. Success moment SVG. Built in feat/motion-editor. Removing `framer-motion` and `tsparticles-slim` needs a lockfile change and ships with phase 2 | Prism rollout batches for those screens merged (done) |
| 2, public site | Hero (OGL with poster and watchdog), How it works (GSAP), pools reveals (CSS), Lenis, Pause motion. Built in feat/motion-public behind `NEXT_PUBLIC_SHOW_MOTION` (on in staging, off in production) | Counsel on GSAP scope, the pool beat and the hero copy before the production flag turns on |
| 3, editor moments | Follow, empty states, pool created result. Built in feat/motion-editor | Boards approved |

### 3.10 Acceptance criteria

1. No animation library appears in the editor bundle. `framer-motion`, `motion`, `@rive-app/*` and `gsap` are absent from `apps/client/package.json`.
2. Under `prefers-reduced-motion`, no element moves on the landing page, in the editor or on creator pages, and every state change is instant.
3. On a touch device, Lenis is not active and native scrolling and momentum work.
4. The hero poster paints first and is the LCP element. With a median first-frame time over 28 ms, the canvas is removed.
5. Landing LCP under 2.5 s and INP under 200 ms on a Lighthouse mobile run.
6. No GSAP import exists under `apps/client` or any creator effect renderer.
7. No GSAP or WebGL code runs in any Review or Commit step of a money flow.
8. Every motion duration in code comes from `motion.ts` or the preset classes.
9. The How it works sequence reads fully as plain text with JavaScript disabled.
10. The body never scrolls sideways at 390.
11. A bottom sheet closes by drag, Escape or scrim, and focus returns to its trigger.
12. No token total, balance or token amount animates. Only the pool and staker counts count up.
13. Typecheck and build pass for `client`, `landingpage` and `@repo/ui`.

## Sources

- GSAP standard license: https://gsap.com/community/standard-license/
- Rive pricing: https://rive.app/blog/new-pricing
- Lenis: https://github.com/darkroomengineering/lenis
- React Router view transitions: https://reactrouter.com/how-to/view-transitions

## Revision log

- 2026-10-04: v1. Decisions accepted. Quick win shipped in the same PR.
- 2026-10-04: v2 after the deep dive and prototype. Decision 1 drops Motion. Decision 4 drops Rive for SVG. New decisions 5 (no count-up) and 6 (ambient phone hero). Adds the frame watchdog, sheet drag, a 70 KB public budget, the CI blocker and the hero copy flag. Acceptance criteria 10 to 12 added.
- 2026-10-07: v3. Rob took #26 off hold. Decisions accepted; decision 5 takes the alternative (pools and stakers count up, token figures still). Phases 1 and 3 built; phase 2 built behind a flag. Added rail, dock, tabs, press, lift, entrance and checklist rows to 3.4. Tab changes use no View Transition. Criterion 12 updated.
