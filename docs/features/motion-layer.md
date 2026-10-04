# Premium motion layer

Status: approved 2026-10-04 (Rob accepted all four recommendations). Build Board item #26.
Owner: Rob Frasca. Drafted by Claude, 2026-10-04.
Depends on: Prism 2.2 UI rollout (Build Board #20). Motion animates the screens that rollout delivers.

## 1. Research

### Current code (development at 278c04a1)

- Prism motion is CSS only. Section 14 of Prism 2.2: 89 ms micro, 144 ms hover light, 233 ms control, 377 ms panel and rim travel, 610 ms room. One easing, `cubic-bezier(0.2, 0, 0, 1)`. No bounce. `prefers-reduced-motion` removes rim travel and parallax and makes state changes instant.
- `framer-motion` is in the client and landing `package.json` and is imported nowhere.
- `tsparticles-slim` (v2) is in the client `package.json` and is imported nowhere.
- `App.tsx` called `loadAll` from `@tsparticles/all` at editor start, so every particle preset loaded on every editor screen. Fixed in this PR (phase 0, section 3.9). The entry chunk drops by about 70 KB gzip.
- `@lottiefiles/dotlottie-react` is used only by `PayDialog`, which PR #262 removes.
- The editor entry chunk is about 1.29 MB gzip after this PR. A performance budget is part of this spec (section 3.6).

### Libraries considered

| Library | What it is | License and cost | Fit |
| --- | --- | --- | --- |
| GSAP with ScrollTrigger and SplitText | Timeline animation engine; scroll-linked timelines; text split into lines, words and characters | Free for commercial use, plugins included. Prohibited use: tools that let users build visual animations without code and compete with Webflow | Public site scroll stories |
| Lenis | Smooth, weighted scrolling | MIT | Public site, fine pointers only |
| OGL | Small WebGL library | MIT | One hero shader |
| Three.js | Full 3D engine | MIT | Only for a true 3D scene. Not needed now |
| Rive | Vector animation with state machines and inputs | Runtimes free and open source. Editor is a paid seat | Stateful moments in the editor |
| Motion (framer-motion) | React animation: layout, presence, gestures, springs | MIT | Editor sheets, panels, lists |
| View Transitions API | Native cross-state transitions | Browser built in | Editor destination changes, public route changes |
| CSS scroll-driven animations | `animation-timeline: view()` | Browser built in | Simple reveals, progressive enhancement |

## 2. Decisions

Accepted by Rob on 2026-10-04, each as recommended:

1. **Placement.** The public site gets scroll storytelling (GSAP, Lenis, the OGL hero). The editor gets Motion, View Transitions and about five Rive moments. Creator pages and money flows get none of it. Reason: scroll theater sells on a landing page and slows people down in a tool. Lenis breaks nested panels, sheets and inputs.
2. **GSAP scope.** GSAP powers only Amped's own pages. It never powers creator-selectable effects in Design. Reason: the no-charge license prohibits use in no-code animation builders that compete with Webflow, and the Design Motion tab is close to that line. Counsel confirms before the public site work ships.
3. **WebGL engine.** OGL, not Three.js, for the hero shader.
4. **Vector engine.** Rive for stateful moments. dotLottie is retired after #262.

## 3. Detailed spec

### 3.1 Surfaces

| Surface | App | Libraries | Never |
| --- | --- | --- | --- |
| Landing `/`, How it works, pools directory hero | `apps/landingpage` | GSAP, ScrollTrigger, SplitText, Lenis, OGL, View Transitions | Motion on money figures |
| Editor (all destinations) | `apps/client` | Motion, View Transitions, Rive, CSS | Lenis, GSAP, WebGL |
| Creator pages `/<handle>` | `apps/landingpage` | Existing creator effects only | Any library in this spec on creator content (Prism 17) |
| Money flows (stake, unstake, claim, send, create pool) | both | Prism CSS motion only | Rive, GSAP, WebGL, celebration in Review or Commit (Prism 15) |
| Auth cards, OAuth screens | `apps/landingpage` | Prism CSS motion only | Scroll effects |

### 3.2 Motion tokens

Prism section 14 stays the source. This spec adds named tokens in `packages/ui` (`motion.ts`) so every library uses the same values.

| Token | Value | Use |
| --- | --- | --- |
| `micro` | 89 ms | press, checkbox |
| `hover` | 144 ms | ILLUMINATED |
| `control` | 233 ms | toasts, chips, menus |
| `panel` | 377 ms | sheets, side panels, rim travel |
| `room` | 610 ms | destination change |
| `story` | scroll linked | public site only |
| `ease` | `cubic-bezier(0.2, 0, 0, 1)` | all eased motion |
| `spring` | stiffness 400, damping 40, no overshoot | Motion drag release only |

No bounce or overshoot anywhere. GSAP uses `CustomEase` built from the same curve. Rive files use the same durations in their state machines.

### 3.3 Public site choreography

1. **Hero.** OGL shader: a Prism glass refraction beam that follows the pointer on desktop and device tilt on phones (tilt only after a tap, as iOS requires permission). Static poster first; the canvas fades in over 610 ms once ready. Headline lines reveal with SplitText, 55 ms stagger, 377 ms each.
2. **How it works.** One pinned ScrollTrigger sequence in four beats: claim a page, design it, fans follow, fans join a pool. Each beat is a Prism board scene. The pool beat shows mechanics only: stake moves into the pool contract, membership unlocks access. No amounts, no rates, no outcomes. Counsel reviews this beat.
3. **Pools directory.** Network totals count up once on enter (tabular figures, 610 ms). Cards rise 13 px and fade on enter with CSS scroll-driven animations; ScrollTrigger is not needed here.
4. **Lenis.** On pointer: fine devices only. Off on touch, off under reduced motion, off while any dialog or sheet is open. Anchor links and keyboard scrolling keep working.

### 3.4 Editor choreography

| Moment | Engine | Behaviour |
| --- | --- | --- |
| Destination change (rail, dock) | View Transitions | 610 ms room crossfade; the top bar title morphs. Instant under reduced motion |
| Bottom sheet, side panel | Motion | 377 ms slide with drag to dismiss on phones |
| Block list reorder, add, delete | Motion layout | 233 ms; Undo restores with the reverse animation |
| Toast | Motion presence | 233 ms in, 144 ms out |
| Follow and Following (creator frame) | Rive | Follow to Following state, pending dot pulse once |
| Setup checklist complete (Home) | Rive | Prism success moment: rim travels full circle once, check draws in |
| Pool created (result step) | Rive | Same success moment. Shown on the result only, never on Review |
| Empty states (People, Following, Analytics) | Rive | Idle loop, paused off screen and under reduced motion |
| First-follow sheet | Motion | Rows stagger 55 ms |

Rive files live in `packages/ui/assets/rive/`, one per moment, each under 40 KB, loaded with the lightweight canvas runtime only when the moment renders.

### 3.5 Phones and desktop

- Every sequence has a 390 design and a 1440 design. GSAP uses `gsap.matchMedia()` with breakpoints at 640 and 1024.
- Pinned sections on phones are shorter (two screens maximum) and never trap the scroll.
- WebGL device pixel ratio capped at 1.5. Paused when off screen or the tab is hidden. Static poster when `prefers-reduced-motion`, `Save-Data`, or a low-power device (fewer than 4 cores or under 4 GB memory) is detected.
- Touch targets and focus order never depend on animation state.

### 3.6 Performance budget

| Metric | Target | Where |
| --- | --- | --- |
| LCP | under 2.5 s on a mid-range phone (Moto G Power class, 4G) | landing, pools, creator pages |
| INP | under 200 ms | everywhere |
| CLS | under 0.1 | everywhere |
| Animation JS on first load | public site under 60 KB gzip before the hero canvas; editor adds none to the entry chunk | both apps |
| Frame rate | 60 fps target, no long tasks over 50 ms during scroll | public site |

Every library in this spec loads by dynamic import on the route or moment that uses it. Lighthouse CI runs on the landing page, a creator page and the editor Home in the pipeline (Build Board ws-ci-pipeline).

### 3.7 Accessibility

- `prefers-reduced-motion`: no scroll pinning, no Lenis, no WebGL motion (poster only), Rive shows its end state, View Transitions are instant.
- A Pause motion control on the landing page, like the one on creator pages (041 I02).
- No content is reachable only by scrolling an animation. Every beat in a pinned sequence is also plain text in the DOM, in order.
- SplitText keeps the original text available to screen readers (`aria-label` on the parent, split nodes `aria-hidden`).

### 3.8 Compliance

- GSAP stays out of the creator Design Motion tab and any creator-selectable effect (decision 2). Counsel confirms the scope before public site work ships.
- Trust rule: no spectacle in Review or Commit. Success moments play on result steps only.
- The How it works pool beat describes mechanics only. It shows no amounts, rates, returns or growth. Banned words from the gating, broadcast and explorer lists apply to all animated copy. The build copy check scans the new components.
- No count-up or motion on token amounts, balances or rewards anywhere.

### 3.9 Phases

| Phase | Scope | Gate |
| --- | --- | --- |
| 0, quick wins (this PR) | Particles load on first use, not at editor start | None |
| 1, editor foundation | `motion.ts` tokens, Motion for sheets, panels, list and toasts, View Transitions on destination change. Remove `tsparticles-slim`, rename `framer-motion` to `motion` | Prism rollout batches for those screens merged |
| 2, public site | Landing hero (OGL), How it works sequence (GSAP), pools directory reveals, Lenis, Pause motion | Counsel on GSAP scope and the pool beat. Prism boards with motion notes approved |
| 3, Rive moments | Five Rive files and the success moment | Rive editor seat. Boards approved |

### 3.10 Acceptance criteria

1. No library in this spec appears in the editor entry chunk. Each loads on the route or moment that uses it.
2. Under `prefers-reduced-motion`, no element moves on the landing page, in the editor or on creator pages, and every state change is instant.
3. On a touch device, Lenis is not active and native scrolling and momentum work.
4. The OGL hero shows a static poster first, and the poster is the LCP element.
5. Landing LCP under 2.5 s and INP under 200 ms on the Lighthouse CI mobile profile.
6. No GSAP import exists under `apps/client/src/components/panels/design` or any creator effect renderer.
7. No Rive, GSAP or WebGL code runs in any Review or Commit step of a money flow.
8. Every motion duration in code comes from `motion.ts`.
9. The pinned How it works sequence is fully readable as plain text with JavaScript disabled.
10. Typecheck and build pass for `client`, `landingpage` and `@repo/ui`.

## Sources

- GSAP standard license: https://gsap.com/community/standard-license/
- Rive pricing: https://rive.app/blog/new-pricing

## Revision log

- 2026-10-04: First spec. Decisions accepted. Quick win shipped in the same PR.
