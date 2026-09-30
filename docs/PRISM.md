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

## Components (PR 2)

All shared components live in `packages/ui` and are exported from `@repo/ui`. The existing primitives were restyled in place, so every screen that uses them changes with this PR. See them all at **`/_prism`** in the client app (signed in, not linked anywhere).

### Restyled in place

| Component | Prism rule |
|---|---|
| `Button` | `default` next step (indigo, 44), `lg` primary 55, `commit` money commit only (value deep), `secondary` and `outline` lens, `ghost` (lens shown at rest), `link`, `destructive`. `confirm` is kept for callers and maps to `default`. Every size is at least 44. Disabled: 40% ink, dashed ring, no shadow |
| `Input`, `Textarea` | Label 16/20 600 above, G2 well 44 high r13, `helper` 13/16, `error` 13/16 danger with icon, linked by `aria-describedby`. `className` still styles the field; use `containerClassName` for the wrapper |
| `Label` | 16/20 600 ink |
| `Dialog` | Raised glass r21, padding 34, 508 wide, scrim. Below 640 it is a bottom sheet with r34 top corners and a grab handle. Title 20/23 700, close is a 44 icon button. Scrolls inside when taller than the viewport (fixes the Fund dialog title clipping) |
| `Select` | Trigger is a G2 well; content is raised glass r13 with 44 rows |
| `Switch` | Indigo when on, create-ink focus ring, 44 row |
| `Tooltip` | White text on ink, r8, max 288 wide |
| `Badge` | 26 high r8: `default` (selected), `secondary` (category), `success`, `warning`, `outline`, `destructive` |
| `Card` | G1 clear r21 |
| `Skeleton` | Line fill, no shimmer under reduced motion, `delayMs={400}` to wait before showing |
| `Toaster` (Sonner, landing and admin) | Prism toast, bottom left, 34 from the edges |

### New

| Component | Use |
|---|---|
| `Chip`, `ChipGroup` | Filters and presets. `ChipGroup` is a radio group with arrow keys |
| `Tabs` | G1 navigate container 55, selected tab is the lens thumb |
| `Menu` | Raised glass r13, 44 items, `destructive` items |
| `BottomSheet` | Mobile More sheet and choosers |
| `EmptyState` | 34 icon in a 55 disc, title, one line, one next step |
| `ErrorCard` | Local error with Retry. Name what failed; never show raw server text |
| `Notice` | `info` and `success` on G1 clear; `warning` and `error` on the solid notice |
| `ToastCard` | The one toast look. The client renders every toast with it |
| `TESTNET_NOTICE` | The verbatim testnet line |

### Money flow pieces and pool cards (PR 2b)

| Component | Use |
|---|---|
| `SidePanel` | The G3 value panel as a side sheet: 508 wide, 21 from the right, top and bottom on desktop; full screen on mobile. Header with 55 art tile, eyebrow with the purple marker, title, byline, 44 close. `calm` switches to the commit state (no rim, no halo). `footer` holds the primary action |
| `StepBar` | 3px bars. Current indigo with glow, done success with check and a hidden ", done", next line. D23 labels: Amount (or Name, Recipient, Connect), Review, Confirm in wallet |
| `AmountWell` | 131 high, create light, Bebas amount (68 on mobile), 44 unit pill. `available`, `balanceAfter`, `error`. `calm` removes the light, makes it read only and shows Edit amount |
| `AmountPresets` | 44 pill presets (25%, 50%, Max) |
| `ReviewSlab` | G2 slab, 44 rows, tabular figures. The caller passes every row |
| `Checkbox` | 24 box r5, value deep when checked. Used for the required acknowledgement on Review |
| `CommitAction` | Value deep 55 button labeled with the verb and amount, then the wallet note (`WALLET_NOTE`, or an approved line for embedded wallets) |
| `PoolCardFeatured` | G3 lens, art 202, badges, creator row, 26/33 title, stats footer, View page in a new tab |
| `PoolCardMedium` | G1 clear, art 110, 16/20 title, meta line |
| `PoolRow` | G0 flat row 46 high, 34 art, right aligned tabular figures |

Pool cards take `stats` as label and value pairs, so each screen uses its approved wording. The rate label is "Network Reward Rate". Never APY or APR.

The gallery at `/_prism` has a working stake demo that composes these pieces. PR 4 turns that composition into the shared money flow.

### Toasts in the client

`react-hot-toast` calls and `toast.add` from `components/ui/toast` now share one queue and one stack at the bottom left (above the dock on mobile). Errors stay until dismissed; success and info leave after 5 seconds.

### Tailwind merge

`cn()` in `packages/ui` knows the Prism tokens, so a caller's `h-12` replaces `h-touch` and `text-prism-label` is treated as a font size.

## Rules reviewers should enforce

1. **Trust rule.** Spectacle falls as commitment rises. The Review and Confirm step uses `prism-value-panel-calm`, has no rim, uses a solid `prism-notice`, and has a required checkbox. The commit button is `value-deep`, followed by the wallet note.
2. **Rates.** Never label a rate APY or APR. The figure is an instantaneous estimate, not a past average.
3. **Testnet copy, verbatim:** "Testnet only. tREVO has no cash value. Pool rewards are set by the creator, vary, and are not guaranteed."
4. **Contrast.** Text meets WCAG AA against the worst background under its glass: 4.5:1 for body, 3:1 for 24px and up and for non-text UI.
5. **Creator pages.** The creator's theme outranks the system. Never force cyan, indigo or purple onto a creator page.

## Rollout

The work ships in batched PRs:

1. Tokens
2. Shared components restyled in place, with the gallery; 2b money flow pieces and pool cards
3. App shell
4. Money flow
5. Screen batches by app area, each tied to Amped.Bio Screen Review row numbers
