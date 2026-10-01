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

All shared components live in `packages/ui` and are exported from `@repo/ui`. The existing primitives were restyled in place, so every screen that uses them changes with this PR. See them all at **`/_prism`** in the client app (signed in, not linked anywhere, not served in production builds).

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

`react-hot-toast` calls and `toast.add` from `components/ui/toast` now share one queue and one stack at the bottom left (above the dock on mobile). Errors leave after 10 seconds (pass `duration: Infinity` when the user must act); success and info leave after 5 seconds.

### Tailwind merge

`cn()` in `packages/ui` knows the Prism tokens, so a caller's `h-12` replaces `h-touch` and `text-prism-label` is treated as a font size.

## App shell (PR 3, Screen Review 001 to 005)

The editor shell lives in `apps/client/src/components/shell`. `Layout.tsx` assembles it.

### Structure (D01, D08, D09)

| Piece | File | Rule |
|---|---|---|
| Destinations | `destinations.ts` | Seven destinations in D01 order: Home, Explore (unlabeled Start group), Page, Design, Analytics (Page), Wallet, My Pool (Money). Flags decide what renders; a flag off item is not rendered and never shows Soon |
| Rail | `Rail.tsx` | Desktop 768 and up. `prism-dock` capsule at x 21, 89 wide, full height minus 21, padding 13. Items 61 x 64, r27, 21 icon over a 13/16 label. Current item: `prism-lens-thumb` plus `aria-current="page"`. Group eyebrows above Page and Money, hidden when the group is empty |
| Mobile dock | `MobileDock.tsx` | Below 768. `prism-dock` 21 from the edges above the safe area. Current item: `prism-dock-lens` (rises 13). More opens the bottom sheet with the rest. With five or fewer enabled destinations all sit in the dock. The dock hides while the keyboard is open |
| Top bar | `TopBar.tsx` | Desktop: G1 navigate 55, r34. Title as the page h1 ("Design, Themes" on a tab), then save status (Page, Design), View page and Copy page link, Help, wallet chip (Wallet, My Pool, Explore, Pay, RNS), avatar. Mobile: title, status, avatar |
| Account menu | `AccountMenu.tsx` | Identity header, Account settings, View my page, Help (sub menu), Sign out. On mobile View my page and Copy page link come first |
| Help | `HelpMenu.tsx`, `useSupportWidget.ts` | Help articles, Contact support, Community on Telegram. The Freshworks script loads once per session with the launcher hidden. If it has not loaded 5 seconds after Contact support, the portal opens in a new tab |
| Wallet chip | `WalletChip.tsx` | Address only (6 plus 4), never a balance. Copy address, Open in explorer, Go to Wallet |
| Announcement | `components/Banner.tsx` | In flow notice under the top bar. Info and success on G1 clear, warning and error on the solid notice. Open <destination> ghost button only when the admin set one. Dismiss is stored per message |
| Leave guard | `ShellNavigation.tsx` | Destination changes flush a pending save. If the save fails or the browser is offline, the shared Dialog asks: Retry save or Leave anyway |

New preset recipes: `prism-dock` (dock capsule, tint 0.12, white 0.56), `prism-dock-item` (CLEAR at rest, ILLUMINATED on hover, no scale) and `prism-dock-lens` (the rising lens).

### Routes

| Old | New |
|---|---|
| `/profile`, `/blocks` | `/page` |
| `/gallery` | `/design?tab=themes` |
| `/createRewardPool` | `/my-pool` |
| `/developer` | `/account?tab=developers` |

`/pay` and `/rns` stay routable and count as Wallet in the rail. Wallet's Send button now opens Pay (it only changed state before). Destination tabs live in `?tab=` (`useDestinationTab`).

### Autosave (D11, D26)

`EditorContext` saves 800ms after the last edit, on blur, on a destination change and when the connection returns. Every edit bumps a revision counter, so an edit made during a save stays dirty and saves next. `saveStatus` is `idle`, `saving`, `saved`, `error` or `offline`. The top bar shows Saved, Saving (after 400ms), Could not save with Retry, or Offline. Changes save when you reconnect. There are no Save buttons and no success toasts. `beforeunload` asks only while an edit is not stored. Handle, email, password, two factor, theme apply and import, and money flows keep their explicit submits.

### Interim destinations

Design is replaced in PR 3a, Page in PR 3b and Account Settings in PR 3c (below). The Two factor row content and the Developers tab keep today's look until 021 and 098. Destinations that are not restyled yet sit on a white surface so their current colors stay readable on the room; each batch removes it.

## Design (PR 3a, Screen Review 023 to 033)

Design lives in `apps/client/src/components/panels/design`. `DesignPanel.tsx` holds the tabs and the theme file actions.

### Pieces

| Piece | File | Rule |
|---|---|---|
| Disclosure rows | `kit/DisclosureRow.tsx` | One row open per tab, stored in `amped:design-style-open` and `amped:design-motion-open`. Header is an h3 with a button (`aria-expanded`), the current value, a swatch and a warning icon when a contrast pair fails. The region mounts only while open |
| Option tiles | `kit/OptionTile.tsx` | A radiogroup with roving focus (arrows, Home, End). Selected: indigo ring and a 21 check. Hover and focus preview on the live frame; leaving ends the preview |
| Color control | `kit/ColorControl.tsx` | Swatch opens the system picker, hex field checks on blur ("Use 6 hex digits, for example #FFFFFF"), plus a Your colors row from the current theme |
| Contrast guard | `kit/useDesign.ts`, `kit/Notices.tsx` | Text on the card and on buttons needs 4.5:1, the name with an effect needs 3:1. A failing pair shows the solid notice with the measured ratio and one fix (Fix contrast, or Remove effect for the name) |
| Locked themes | `kit/Notices.tsx`, `kit/useThemeActions.ts` | A marketplace theme (`user_id` null) is read only. Style and Motion show one notice with Make an editable copy, which stores the look as the creator's own theme |
| Themes | `themes/ThemesTab.tsx`, `themes/ThemeCard.tsx` | Current theme card, collection chips in `?collection=`, search (233ms debounce), one section per collection with See all. Selecting a card pins the preview ("Previewing X. Not applied yet.") until Escape. Apply goes to the server first, then an 8 second Undo. Phones open a full height preview sheet |
| Theme files | `DesignPanel.tsx` | Overflow menu (a bottom sheet on phones): Save theme file, Import theme file, How theme files work. File names keep letters, digits and hyphens (`themeFileName`). Import autosaves and offers Undo; on a locked theme it becomes the creator's own theme |

### Live preview

`EditorContext` has `previewOverride` (a partial theme config and a label). `Layout` merges it into the preview frame and shows the label chip. It clears when the destination changes. Nothing in an override is saved.

### Renderer (shared with the public page)

`@repo/ui` `theme-style.ts` holds `THEME_DEFAULTS` (what public pages render today) and `themeCssVars`. Neon, gradient and glow buttons, gradient and glow containers, and the name glow read `--amped-*` variables instead of fixed colors, so they follow the creator's colors in the editor and on amped.bio alike. The Glow name effect now glows in the creator's text color and no longer forces white text. Every animation is `motion-safe:`. Particles show a still frame under reduced motion and pause off screen. Playfair Display, Lora and Space Grotesk join the font list in both apps.

### Removed

`panels/appearance`, `panels/effects`, `panels/gallery`, `CollapsiblePanelWrapper`, `profile/AppearanceTabContent` and `profile/EffectsTabContent`. The marketplace view, filter and sort state left the editor store. `/profile?tab=appearance`, `effects` and `theme` land on the matching Design tab.

## Page (PR 3b, Screen Review 006, 017, 018, 022, 034 to 037)

Page lives in `apps/client/src/components/panels/page`. The live preview lives in `apps/client/src/components/preview`.

### Pieces

| Piece | File | Rule |
|---|---|---|
| Live preview frame | `preview/PreviewFrame.tsx` | Frame on Page and Design from 1024 up, with Phone (390) and Desktop (1440 scaled) tabs. The choice is stored per viewer. The creator's background stays inside the frame. Below 1024 the Edit and Preview tabs switch views, stored in `?view=preview`. When there are no blocks, the frame shows an Add block hint |
| Preview behavior | `components/Preview.tsx` | Clicks never navigate or count. A click opens the block in the Page list; on Design it does nothing. Hidden blocks do not render. Incomplete blocks show a Fix chip. The footer reads Made with Amped.Bio |
| Header card | `header/ProfileHeaderCard.tsx` | Photo, Display name, handle, RevoName (only when RNS is on) and Bio, all autosaved. The Bio editor is the Prism toolbar in `blocks/text/TextEditor/SlateEditor.tsx`: four 44 buttons with roving focus, shortcuts, and an Align menu |
| Photo | `header/PhotoControl.tsx`, `header/CropDialog.tsx` | The circle is the control and accepts a dropped file. Crop photo saves exactly what the circle shows, 512 px square. Remove photo has an 8 second Undo. Errors appear under the photo with Retry |
| RevoName | `header/RevoNameField.tsx` | A select with loading, no wallet and no names states. The expired or lost notice replaces the modal. Manage names opens RNS My names until Wallet Names exists |
| X import (022) | none | Not rendered (D07) until a server lookup exists. `TwitterImport` and the browser bearer token are removed |
| Blocks list | `blocks/BlocksSection.tsx`, `blocks/BlockRow.tsx` | The eyebrow row with Add block, then one card of rows in visitor order. The handle, visibility toggle (`config.hidden`) and overflow menu are always visible. The overflow menu holds Open link, Move up, Move down and Delete. Delete is instant with an 8 second Undo, and the server delete runs when the Undo expires. Drag uses an 8 px activation distance, or a 233 ms long press on touch, with named announcements |
| Inline editing | `blocks/BlockFields.tsx` | The open row is the region's one lens with fields on the slab. Valid changes go to the editor state at once and autosave. Invalid input shows its fix on blur and never saves. A new block is a draft row, created on the server from its first valid value |
| Add block | `blocks/AddBlockDialog.tsx`, `blocks/LinkFields.tsx` | The Link section comes first: one field detects the platform, shows a chip with Change, and prefills Label. Then the MEDIA, UTILITY and WEB3 tiles. If a referral block exists, its tile opens that block |
| Block validity | `@repo/constants` `block-validity.ts` | One rule for the editor list, the preview and amped.bio. A block renders when it is not hidden and its required field is present |

### Removed

- `panels/blocks` (except `PoolSearchInput`).
- `profile/ProfileForm`, `ImageUploader`, `PhotoEditor` and `TwitterImport`.
- `page/RevoNameIssueDialog`, `ui/Slider` and `utils/twitter.ts`.
- `addBlock` no longer toasts or clears the unsaved flag.
- `removeBlock` throws on failure.

## Account (PR 3c, Screen Review 019, 020)

Account Settings lives in `apps/client/src/components/panels/account`. It is one 610 column with one G1 clear card of flat disclosure rows (`design/kit/DisclosureRow.tsx`, with `inset` for rows inside a card). One row opens at a time. `?open=url` or `?open=email` opens a row; the @handle on the Page header card links to `?open=url`.

### Pieces

| Piece | File | Rule |
|---|---|---|
| Public URL (020) | `PublicUrlRow.tsx`, `hooks/useHandleAvailability.ts` | Row value amped.bio/handle (no @). One well with the prefix inside it. The status line names the state in words and an icon: Your current URL, Checking (after 400ms), available, taken, too short, or the check failed with Retry. The current handle is compared ignoring case before any format check, so a legacy handle with capitals never shows an error. Typed input is cleaned; a helper names the rule for 5 seconds. An available new URL shows the solid notice Your old links stop working. Use this URL is explicit, stays on Account, and the toast offers Copy link |
| Email (019) | `EmailRow.tsx`, `hooks/useSecondsLeft.ts` | Two steps in place, no dialog. Step 1: Current email, then one New email field with Send code. Step 2: six 44 x 55 code slots (paste fills them, the sixth digit submits), the expiry countdown, Use a different email and Resend code (60 second cooldown). Errors sit under the field with their fix. Rate limits disable Send code with a countdown. An expired code swaps Verify for Send a new code. Success closes the row with a toast |
| Email change server flow | `apps/server/src/trpc/user.ts`, `utils/email` | The code goes to the new address and is stored with that address (`confirmation_codes.target`). Confirm accepts only that address. The current address gets a notice email. The tRPC error formatter passes `retryAfter` from rate limited errors to the client |
| Two factor | `profile/SecurityTabContent.tsx` | The third row for now, with today's content inside it until 021 |

The Password row (row three in 019 I01) comes with 021. There is no in account password change today.

### Removed

- `profile/ProfileSections`, `profile/URLPicker` and `dialogs/EmailChangeDialog`.
- `ui/URLStatusIndicator`.
- The current email and confirm email fields. The code to the new address is the confirmation.

## Rules reviewers should enforce

1. **Trust rule.** Spectacle falls as commitment rises. The Review and Confirm step uses `prism-value-panel-calm`, has no rim, uses a solid `prism-notice`, and has a required checkbox. The commit button is `value-deep`, followed by the wallet note.
2. **Rates.** Never label a rate APY or APR. The figure is an instantaneous estimate, not a past average.
3. **Testnet copy, verbatim:** "Testnet only. tREVO has no cash value. Pool rewards come from the network, vary, and are not guaranteed."
4. **Contrast.** Text meets WCAG AA against the worst background under its glass: 4.5:1 for body, 3:1 for 24px and up and for non-text UI.
5. **Creator pages.** The creator's theme outranks the system. Never force cyan, indigo or purple onto a creator page.

## Rollout

The work ships in batched PRs:

1. Tokens
2. Shared components restyled in place, with the gallery; 2b money flow pieces and pool cards
3. App shell (001 to 005); 3a Design (023 to 033); 3b Page (006, 017, 018, 022, 034 to 037); 3c Account (019, 020)
4. Money flow
5. Screen batches by app area, each tied to Amped.Bio Screen Review row numbers
