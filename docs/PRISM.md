# Prism 2.2 design tokens

Prism 2.2 (Balanced, v1.0) is the locked Amped.Bio design system. Rob Frasca locked it on 26 Sep 2026. This file explains how the system is wired into the code. Any value change needs Rob's written approval and a version bump: v1.1 for additions, v2.0 for breaking changes.

## Where it lives

- `packages/ui/src/prism/tailwind-preset.js` is the single source. It is a Tailwind preset plus a small plugin function.
- `apps/client`, `apps/admin` and `apps/landingpage` load it with `presets: [prismPreset]` in their Tailwind config.
- The fonts are Figtree (400 to 700) and Bebas Neue, from Google Fonts. The client and landing page add them to their existing font link. Admin gets its own link.

Adding the preset changes nothing on screen. Every token is under the `prism` namespace, so it cannot clash with the shadcn tokens (`primary`, `border`, `ring` and so on). A screen changes only when a component uses a `prism` class.

The repo rule is Tailwind only, no new CSS files. The glass recipes are too long for utility strings, so they are component classes registered by the preset's plugin. They are still Tailwind output.

## Token reference

### Color (spec section 3)

Use as `bg-prism-*`, `text-prism-*`, `border-prism-*`.

| Token | Value | Use |
|---|---|---|
| `env` | #F4F3FA | Page background |
| `surface` | #FFFFFF | Solid surfaces |
| `ink` | #16152B | Primary text |
| `ink-2` | #3A3858 | Secondary text |
| `ink-3` | #524F73 | Meta text only |
| `line` / `line-strong` | 10% / 18% ink | Separators; dividers and input borders |
| `create-light` | #27AAE1 | Light, focus halo, markers. Never text |
| `create-ink` | #0B5A80 | Focus ring core, cyan text |
| `nav` / `nav-hover` / `nav-pressed` | #5650A2 / #46418A / #302F5D | Selection, next step button, links |
| `value` | #884D9E | Beams and markers. Never small text |
| `value-ink` | #6E3A82 | Value icons |
| `value-deep` / `value-deep-hover` | #5B2F70 / #4E2A5E | Commit button, checked checkbox |
| `success` | #17693F | Done steps |
| `warning-ink` on `warning-bg` | #7A4F00 on #FBF1DC | Compliance notices |
| `danger` | #B3261E | Destructive actions |

Color carries meaning: cyan is create, indigo is navigate, purple is value. Utility colors are never decorative.

### Type (section 11)

- Families: `font-prism` (Figtree) and `font-prism-display` (Bebas Neue).
- Sizes: `text-prism-display` 110/100, `text-prism-amount` 110/110, `text-prism-display-68`, `text-prism-display-42`, `text-prism-card-title` 26/33 700, `text-prism-panel-title` 20/23 700, `text-prism-body` 16/26, `text-prism-label` 16/20, `text-prism-meta` 13/16, `text-prism-eyebrow` 13 600 caps with 0.08em tracking (add `uppercase`).
- Numbers are always tabular. Add `tabular-nums`, or put `prism-font` on the root, which sets Figtree and tabular numbers together.

### Spacing (section 12)

The spec uses a Fibonacci scale. Production snaps it to the 4px grid, and the snapped values match Tailwind's default scale:

| Spec | Production | Tailwind | Alias |
|---|---|---|---|
| 3, 5 | 4 | `1` | `phi-3`, `phi-5` |
| 8 | 8 | `2` | `phi-8` |
| 13 | 12 | `3` | `phi-13` |
| 21 | 20 | `5` | `phi-21` |
| 34 | 32 | `8` | `phi-34` |
| 55 | 56 | `14` | `phi-55` |
| 89 | 88 | `22` | `phi-89` |
| 144 | 144 | `36` | `phi-144` |
| 233 | 232 | `58` | `phi-233` |

Either form works. The `phi-*` aliases make the intent clear in review. Targets: `h-touch` (44, the minimum) and `h-commit` (55, primary actions).

### Radius (section 12)

`rounded-prism-5` checkbox, `-8` badges and thumbnails, `-13` inputs, buttons, art and notices, `-21` cards, wells and slabs, `-27` and `-30` dock items, `-34` panels and dock capsules, `rounded-full` chips and tabs.

### Elevation (section 13)

Light comes from the upper left, so shadows fall down and right.

`shadow-prism-e0` flat rows, `-e1` chips, `-e2` chrome, `-e3` clear card, `-e4` lens card, `-e5` value panel.

### Motion (section 14)

- Durations: `duration-prism-micro` 89ms, `-hover` 144ms, `-control` 233ms, `-panel` 377ms, `-room` 610ms.
- Easing: `ease-prism`.
- No bounce. Under `prefers-reduced-motion`, state changes are instant and the rim does not travel.

## Materials (sections 4 to 8)

| Class | Level | Use |
|---|---|---|
| `prism-room` | G0 | Page environment, base layer. The light beams come in the shell PR |
| `prism-row` | G0 | Flat list row with a hairline separator |
| `prism-glass-nav` | G1 | Top bar tabs, wallet chip, dock capsules. Add the radius |
| `prism-glass-clear` | G1 | Secondary cards, r21 |
| `prism-well` | G2 | Input well and search, r13, minimum height 44 |
| `prism-slab` | G2 | Tables inside the value panel, r21 |
| `prism-lens` | G3 | The one focused object per region, r21 |
| `prism-value-panel` | G3 | Stake panel and money flow panels, r34 |
| `prism-value-panel-calm` | G3 calm | The commit (Review) state. No rim, no halo |
| `prism-notice` | Solid | Compliance notice. Never glass |
| `prism-lens-thumb` | Control | Selected tab or chip |
| `prism-focus` | Control | Focus ring for every control: create-ink core plus cyan halo |

### Spectral rim and halo (section 6)

```tsx
<div className="prism-lens relative">
  <span aria-hidden className="prism-halo-card" />
  <span aria-hidden className="prism-rim" />
  {children}
</div>
```

Rules:

- At most one rim per region (context and commitment).
- Never on the commit state.
- The host must not use `overflow-hidden`, or the rim and halo get clipped.

### Mobile

Below 768px the preset lowers the blur on the glass levels. The spec asks for less blur and fewer layers on mobile. Spectrum, spacing, type and activation stay the same.

## Rules reviewers should enforce

1. **Trust rule.** Spectacle falls as commitment rises. The Review and Confirm step uses `prism-value-panel-calm`, has no rim, uses a solid `prism-notice`, and has a required checkbox. The commit button is `value-deep`, followed by the wallet note.
2. **Rates.** Never label a rate APY or APR. The figure is an instantaneous estimate, not a past average.
3. **Testnet copy, verbatim:** "Testnet only. tREVO has no cash value. Pool rewards are set by the creator, vary, and are not guaranteed."
4. **Contrast.** Text meets WCAG AA against the worst background under its glass: 4.5:1 for body, 3:1 for 24px and up and for non-text UI.
5. **Creator pages.** The creator's theme outranks the system. Never force cyan, indigo or purple onto a creator page.

## Rollout

The work ships in batched PRs:

1. Tokens (this PR)
2. Shared components restyled in place, with the gallery
3. App shell
4. Money flow
5. Screen batches by app area, each tied to Amped.Bio Screen Review row numbers
