# Motion layer: deep dive, design QA and evaluation

Build Board item #26. Spec: docs/features/motion-layer.md (v2). Date: 2026-10-04.
Prototype: Amped Motion Lab, https://claude.ai/artifact/B5P8pvSWzAph7Y6uAyS6MV
Boards: Amped design gallery, section "Motion layer (#26)", frames mo1 to mo6.

## 1. Method

1. Read the v1 spec against the code at 278c04a1, Prism 2.2 sections 14, 15 and 17, and the gating, broadcast and explorer specs.
2. Measured each library from its published package with esbuild and gzip.
3. Built a single-page prototype on the real libraries: GSAP 3.15.0 with ScrollTrigger and SplitText, Lenis 1.3.26, OGL 1.0.11, native View Transitions and Web Animations.
4. Tested in Chromium with Playwright at 1440 x 900 and 390 x 844 (touch), with and without `prefers-reduced-motion`. Checked overflow, console errors, long tasks, frame rate and every interaction.
5. Scored the v1 spec and the v2 spec on the five element-eval lenses.

## 2. Findings on the v1 spec

| ID | Sev | Lens | Finding | v2 change |
| --- | --- | --- | --- | --- |
| S01 | S1 | function | Section 3.3 counts up network totals. Section 3.8 bans motion on token figures. The spec contradicts itself | Totals static. Decision 5 |
| S02 | S1 | usability | Phone hero tilt needs the iOS motion permission prompt on a landing page | Ambient drift. Decision 6 |
| S03 | S2 | form | Rive runtime is 477 KB gzip, seven times all public site motion together, for five moments SVG draws at 0 KB | SVG and Web Animations. Decision 4 |
| S04 | S2 | ease | Motion adds 28.5 to 42.1 KB gzip to the editor. Every listed moment runs natively. Its spring token conflicts with Prism's no-overshoot rule | Dropped. Decision 1 |
| S05 | S2 | consistency | `motion.ts` would define a second copy of numbers that already live in `prismMotion` in the Tailwind preset | `motion.ts` re-exports the preset |
| S06 | S2 | function | Lighthouse CI is named as the gate. GitHub Actions is down on billing | Manual Lighthouse run per PR until CI returns |
| S07 | S2 | function | No guard for weak GPUs that pass the core and memory checks | Frame watchdog: median of 45 frames over 28 ms removes the canvas |
| S08 | S2 | consistency | Destination change used a hand-rolled View Transition. react-router 7.11 already wraps it | Use `viewTransition` on navigation |
| S09 | S2 | function | The landing hero copy "hub for staking into Reward Pools" sits beside the counsel-reviewed pool beat | Flagged in 3.8. Goes to counsel with the beat |
| S10 | S3 | function | The pools directory route is `/i/pools` until #9 ships | Noted in 3.1 |
| S11 | S3 | usability | `BottomSheet` has no drag to dismiss. The spec assumed Motion would supply it | Small pointer hook in `@repo/ui` |
| S12 | S3 | consistency | Block reorder already animates with dnd-kit. A second layout engine would fight it | Reorder keeps dnd-kit. Add and delete use View Transitions |

## 3. Findings on the prototype, all fixed

| ID | Sev | Finding | Fix |
| --- | --- | --- | --- |
| P01 | S1 | Body scrolled sideways at 390 (417 px). The lab state line was `nowrap` and the Follow capsule did not wrap | State line wraps to its own row. Capsule wraps |
| P02 | S2 | Software WebGL ran the hero at about 20 fps with long tasks while in view | Frame watchdog falls back to the poster |
| P03 | S2 | The token dot in beat 4 stopped on top of the "Members-only link opens" label | Dot stops at the node edge and fades |
| P04 | S2 | The sticky lab bar took 200 px of a 844 px phone screen | Not sticky under 640. Smooth scroll toggle hidden on coarse pointers |
| P05 | S2 | Bottom sheet at 94% white showed text behind it | Sheet is solid white |
| P06 | S3 | Six pool cards in four columns left an orphan row | Three columns from 900 px |
| P07 | S3 | Three editor moments left an empty column | Grid uses `auto-fit` |
| P08 | S3 | Redundant `aria-current` line in navigation code | Removed |
| P09 | S2 | CustomEase pushed public site motion to 71.9 KB, over the 70 KB budget | Inline cubic-bezier ease, 68.2 KB |
| P10 | S3 | Headline revealed word by word. The spec says line by line | Reveals by line, 55 ms stagger |

## 4. Measurements

| Check | Desktop 1440 | Phone 390 | Reduced motion |
| --- | --- | --- | --- |
| Horizontal overflow | none | none (after P01) | none |
| Page errors | 0 | 0 | 0 |
| Lenis | on | off (touch) | off |
| Pin | on, 2,400 px | off, stacked | off, stacked |
| Hero | WebGL beam, or poster by watchdog | WebGL beam | poster |
| Idle frame rate, hero off screen | 60 fps, 0 long tasks | n/a | n/a |
| Long tasks during scroll, poster | 0 | 0 to 1 | 0 |

The sandbox has 2 CPU cores and software WebGL. With the WebGL beam in view it rendered about 20 fps. That is why the watchdog exists. Real device numbers come from the phase 2 Lighthouse run on a Moto G Power class phone.

Interactions, all pass: sheet opens and moves focus to Close; Lenis stops while it is open; drag past 30% dismisses; Escape closes and returns focus to Open sheet; the reduce toggle removes the pin, Lenis and the canvas at runtime and restores them when turned off; rail navigation updates the title and `aria-current`.

## 5. Weights

| Surface | v1 | v2 |
| --- | --- | --- |
| Public site, after LCP | 68.2 KB | 68.2 KB |
| Editor | 28.5 to 42.1 KB (Motion) plus about 477 KB on first Rive moment | 0 KB |
| Phase 0 saving, editor entry chunk | 69.7 KB | 69.7 KB (shipped in this PR) |

## 6. Scores

| Lens | v1 | v2 | Reason |
| --- | --- | --- | --- |
| Function | 3 | 5 | Count-up contradiction and tilt permission removed. Watchdog and sheet drag added |
| Usability | 3 | 4 | No permission prompt. Reduced motion verified end to end. Pause motion still to design |
| Ease | 3 | 5 | One engine per surface. Editor needs no library |
| Consistency | 3 | 5 | Tokens come from one source. Router and dnd-kit reused |
| Form | 4 | 5 | Weight budget held. Phone layout fixed |

## 7. Gates

| Gate | Result |
| --- | --- |
| Tokens | Pass. Every duration and the easing come from Prism 14 |
| Trust (Prism 15) | Pass. No motion in Review or Commit. Pool beat shows mechanics only |
| Creator rule (Prism 17) | Pass. No library touches creator content |
| Reduced motion | Pass in the prototype |
| Phone 390 | Pass after P01 and P04 |
| Performance | Partial. Weights pass. LCP and INP wait for a real device run |
| Counsel | Open. GSAP scope, pool beat, hero copy |

## 8. Decisions for Rob

- **D1 revised.** No animation library in the editor. Recommend: accept.
- **D4 revised.** SVG instead of Rive. Recommend: accept.
- **D5 new.** Static network totals. Recommend: accept.
- **D6 new.** Ambient phone hero, no tilt. Recommend: accept.

## 9. Open items

1. Pause motion control on the landing page needs a board.
2. Counsel review: GSAP scope, the pool beat and the current hero copy.
3. Real device Lighthouse run in phase 2.
4. GitHub Actions billing, to restore Lighthouse CI.
