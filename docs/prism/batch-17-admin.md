# Batch 17: Admin redesign (Screen Review 087, 088, 089, 094)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

## Rows

| Row | Screen | Result |
|---|---|---|
| 087 | Admin dashboard and users | Built |
| 088 | Admin themes, blocks, files | Built |
| 089 | Admin pools and ndau conversions | Built. The #232 lock and hash record are unchanged |
| 094 | Admin OAuth clients | Built, with the D1 server rule and a vitest test |

## Decisions applied

| Decision | Applied as |
|---|---|
| 087 D1 | Row level on and off settings are the section 8 checkbox with a visible label: Show on the editor, Visible in gallery, Hidden from Explore, the OAuth client On. Platform wide settings use explicit buttons: Turn off faucet (with a confirm), Review changes then Change rewards, Publish. No switch remains in the four rows |
| 089 D1 | Every amount carries the native symbol of the sending chain, tREVO on Libertas Testnet (`libertasTestnet.nativeCurrency.symbol`), in the queue header, the value panel, the Mark as processed dialog, every toast and the CSV header. Review shows the solid compliance card. See Notes for the line used |
| 094 D1 | Skip the consent screen is enabled only when every redirect URI is an https address on amped.bio or a subdomain; otherwise it is disabled with Only Amped.Bio apps can skip consent. Checking it shows the solid notice People will not see a consent screen with the approved body. The server rejects skip consent on create and update with Skip consent is only for apps whose redirect addresses are on Amped.Bio. Badges read Skips consent, Can end sessions, and the type reads Web, confidential |
| 094 D2 | v1.1 monospace token in the Prism preset: `font-prism-mono` (system stack, no font file) with `text-prism-code-sm` 13/21 and `text-prism-code` 16/20. Used for client IDs, the secret, URIs, addresses and hashes, always beside a 44 copy button |

## What changed

### Shared admin shell (087 I01 to I05, I19 to I22)

| Piece | File | Rule |
|---|---|---|
| Destinations | `admin/src/shell/destinations.ts` | Dashboard, Users; Content: Themes, Files, Broadcasts; Money: Pools, Conversions; Access: OAuth clients. Titles: Dashboard, Users, Themes, Files, Pools, ndau conversions, OAuth clients (I01, I02, I20) |
| Rail and dock | `admin/src/shell/Rail.tsx` | Row 001 rail at x 21, lens thumb and aria-current on the current item, group eyebrows, shortcut in each tooltip. Below 768 the dock holds Dashboard, Users, Pools, Conversions, More; More lists Themes, Files, Broadcasts, OAuth clients (I01, I20) |
| Top bar | `admin/src/shell/TopBar.tsx` | One title, Refresh (invalidates the active queries, no reload), Open editor (new tab to `VITE_PANEL_URL`), 44 avatar. Avatar menu: email and Admin badge, Open editor, Keyboard shortcuts (shared Dialog), Sign out. Mobile: title, Refresh icon, avatar (I02, I03, I22) |
| Shortcuts | `admin/src/shell/useAdminShortcuts.ts` | Cmd or Ctrl plus Alt with KeyD, KeyU, KeyT, KeyF, KeyP, KeyN, KeyO on event.code. No B, no Navigated to notice (I04, I21) |
| Layout | `admin/src/pages/AdminLayout.tsx`, `App.tsx` | Room, rail, top bar, content from x 131. `/blocks` redirects to `/` (088 I09). `/themes/new` added |
| Removed | `AdminHeader`, `AdminBreadcrumb`, `AdminQuickActions`, `AdminNotification`, `AdminLoadingSpinner`, `AdminLoadingError`, `components/dashboard/AdminDashboard.tsx`, `pages/AdminBlocks.tsx`, `hooks/useAdminKeyboardShortcuts.ts` | Breadcrumb, duplicate headers, hint box, page reloads (I05, I19). No `dark:` class remains in apps/admin |
| Admin kit | `admin/src/kit/*` | Word badges (26 r8, 8 dot), 44 copy button that confirms on the control, slab table pieces (header 44, rows 55, sortable headers with aria-sort, sticky first column, row skeletons after 400ms, footer pager), search well, labeled chip groups, confirm Dialog, Undo and Retry toasts |

### 087 Dashboard and Users

| Piece | File | Rule |
|---|---|---|
| Stat tiles | `components/dashboard/StatTiles.tsx` | Four G1 clear tiles, 26/33 tabular values, trends in words Up or Down in success or danger (I07) |
| Faucet | `components/dashboard/FaucetCard.tsx` | Status line, wallet 6 plus 4 with copy, one slab row per network with tREVO balance, airdrops left, Low badge under 50. Turn off faucet asks first (Turn off the faucet?), toast Faucet turned off (I08) |
| Referral rewards | `components/dashboard/ReferralRewardsCard.tsx` | Wallet with copy, balance, stats, two wells with a tREVO unit pill, one Review changes: before and after slab, solid compliance card, Change rewards. Per field Save and refresh icon removed (I09) |
| Announcement | `components/dashboard/AnnouncementCard.tsx` | Show on the editor checkbox, Message with Add a message to show the announcement., Type chips, Link to (D01 destinations plus None), live row 005 notice preview, one Publish. The checkbox no longer publishes (I10) |
| Content | `components/dashboard/ContentRow.tsx` | Block performance figures and #5650A2 bars with exact percents; Top handles slab whose rows open the public page. The stray comment is gone (I11, I12) |
| Newest users | `components/dashboard/NewestUsers.tsx` | The Users slab, 5 rows, ghost View all users (I13) |
| Per widget states | all dashboard cards | Each widget shows its own skeleton after 400ms and its own error card with Retry. No page wide spinner (I06) |
| Users | `components/users/UserManagement.tsx` | Search well (2 characters, 300ms), Role and Status chips, Show emails chip (aria-pressed), Reset filters only when filtered, Export menu This page and All matching, pager with Rows per page (I14, I17) |
| Users slab | `components/users/UsersSlab.tsx` | Person first rows 55, masked email k…@domain with copy, Role and Status word badges, tabular counts, Joined, wallet 6 plus 4 with copy. View and Edit 44 icons, overflow with Block or Unblock (applies at once, Undo for 8 s, a failure reverts with Retry), Turn off two factor (destructive Dialog), Copy user ID. Edit user: two wells checked on blur, before and after slab, Save changes only on a change, no typed UPDATE (I15, I16, I18) |

### 088 Themes and Files

| Piece | File | Rule |
|---|---|---|
| Tabs | `components/themes/AdminThemeManager.tsx` | Themes, Collections in `?tab=` (I01) |
| Themes | `components/themes/ThemesTab.tsx` | Search, Collection select, New theme 55, G1 clear cards with the thumbnail untouched, Admin badge, Edit and overflow Delete; Preview hidden. Delete <name>? destructive Dialog, no typed word. Skeleton cards, error card, never had data and filtered empty states, pager (I04, I05, I13) |
| New theme | `components/themes/NewThemeForm.tsx`, `pages/AdminNewTheme.tsx` | One 508 card: Import theme file with an import summary slab and Clear import, Name, Description, Collection, Background with the getLimits line, Thumbnail (required). Errors on blur and on submit. Success: Themes tab and the toast Theme created (I02) |
| Partial create | `NewThemeForm.tsx`, `EditThemeDialog.tsx` | A failed background or thumbnail upload opens the new theme's Edit with Theme created. The thumbnail did not upload. Add it here. and the field focused; the media can be added there (I03) |
| Edit dialogs | `EditThemeDialog.tsx`, `EditCollectionDialog.tsx` | Shared Dialog, Save changes only on a change, Theme updated and Collection updated (I06) |
| Collections | `CollectionsTab.tsx`, `NewCollectionDialog.tsx` | Slab rows 55 with Visible in gallery checkbox (Undo, failure reverts), Edit, overflow Change image. New collection: identifier suggested from Name and checked on blur (I07, I08) |
| Uploads | `components/themes/uploads.ts`, `ThemeThumbnailSelector.tsx` | One module for presigned uploads and file checks. `CreateCategoryTab`, `CreateThemeTab`, `CreateCollectionTab`, `ViewThemesTab`, `ViewCollectionsTab`, `CollectionImageSelector`, `CollectionImageUploader` removed |
| Files | `components/files/FileManagement.tsx` | Search (Enter or 2 characters), Status and Type chips always visible, slab rows 55 with a 34 thumbnail or type icon (state, no innerHTML), middle truncated names, word badges, Preview and Download 44, overflow Delete with Delete <file>? destructive Dialog, states and pager (I10 to I13) |
| Toasts | all theme and file code | react-hot-toast (never mounted in admin) replaced by the mounted Prism toaster (I14) |

### 089 Pools and ndau conversions

| Piece | File | Rule |
|---|---|---|
| Pools | `pages/AdminPools.tsx` | Search, Visibility chips, Needs creation tx chip, Sync transaction. Notice <n> pools cannot sync with Show them. Slab: Pool, Creator, Address with copy, Network name (chain ID in title), Creation tx with copy or Missing and Set, Hidden from Explore checkbox with Undo, Sync 44 or Set creation tx, overflow Open in explorer, Open public page, Edit creation tx. States and pager (I09 to I11, I14, I15) |
| Sync progress | `pages/SyncPoolProgressDialog.tsx` | Section 10 step list, live count slab, Summary grouped Scope, Events, Wallet match, Pool final state with the chain symbol, Done, error card with Retry. The subscription logic is unchanged (I12) |
| Sync and set tx | `pages/SyncTransactionDialog.tsx`, `pages/SetTxidDialog.tsx` | Hash wells checked on blur (Paste a 66 character hash that starts with 0x.), Network select, inline result; Find on chain fills the well, Save transaction saves (I13) |
| Queue | `pages/AdminNdauConversions.tsx` | Status chips with counts, Pending by default; search; Export This view or All; 8 columns plus a 44 disclosure with full addresses and both signatures with copy; word badges with no spinner; overflow Mark as processed, Release to Pending and Discard stored hash on the shared Dialog instead of window.confirm. Show full data removed (I06 to I08, I14, I15) |
| Process | `components/conversions/ProcessPanel.tsx` | SidePanel money flow: Amount (request slab, Connect wallet, Switch to Libertas Testnet, no MetaMask notice), Review (calm, exact slab, network fee estimate, compliance card, required checkbox, Send <amount> tREVO, wallet note), Confirm in wallet, Result (Conversion processed, View transaction, Done). Declined and failed sends say Nothing moved. Sent but not recorded keeps the hash and offers only Record transaction (I01 to I04) |
| Mark as processed | `components/conversions/MarkProcessedDialog.tsx` | Amount and recipient slab, hash well checked on blur, required checkbox This transaction sent <amount> tREVO to <6 plus 4>., Mark as processed (I05) |
| #232 kept | `components/conversions/shared.ts` | Same localStorage key and helpers. The request is still locked on the server before the panel opens; a stored hash is recorded instead of sending; closing before a send releases the lock; the record call retries 3 times |

### 094 OAuth clients

| Piece | File | Rule |
|---|---|---|
| Page | `pages/AdminOAuthClients.tsx` | Search (label visually hidden), chips All, First party, Third party, Turned off with counts, New client. Slab: Client with ID and copy, Owner person first (Amped.Bio team for admin owners), Type, Trust badges, Created, On checkbox named <client> on with Undo and Retry. Rows open the detail Dialog with Edit (I01 to I04, I12) |
| Form | `components/oauth/ClientForm.tsx` | Name, Redirect URIs list with Remove and Add redirect URI, Web app and Native app tiles, Advanced (closed, auth method tiles), trusted client checkboxes with helper lines, the D1 guard. Errors under fields; failures as a strip with a plain cause by error code, never the raw message (I05, I06, I10, I14) |
| Credentials | `pages/AdminOAuthClients.tsx` | Client created step with the ID and, for confidential clients, Copy this secret now with the secret and Copy client secret; Done removes it. The amber box is gone (I07) |
| States and mobile | `pages/AdminOAuthClients.tsx` | 5 row skeletons, 3 for resources; No OAuth clients yet; No clients match <query> with Clear search; error cards. At 390 stacked rows 55 with the On box at the right (I08, I09, I13) |
| Resources | `pages/AdminOAuthClients.tsx` | Name, identifier in mono, scopes as neutral badges, Tokens last N minutes or Default token lifetime, Off badge (I11) |
| Server rule | `server/src/trpc/admin/oauthTrust.ts`, `oauthApps.ts`, `packages/constants/src/oauth-trust.ts` | `assertSkipConsentAllowed` on createClient and on updateClient (checked against the client as it will be after the update). `listClients` also returns the owner's name, handle and role |
| Test | `server/src/__tests__/oauth-skip-consent.test.ts` | Host rule, user info and look alike hosts, the TRPCError on create and update input |

### Shared packages

| Piece | File | Rule |
|---|---|---|
| Mono token | `packages/ui/src/prism/tailwind-preset.js`, `utils.ts` | 094 D2 v1.1 addition, registered with tailwind-merge |
| Checkbox | `packages/ui/src/prism/flow.tsx` | Optional `disabled`, `helper` (aria-describedby), `ariaLabel`, `className`. Existing callers are unchanged |

## Notes

- Compliance line: the 089 D1 answer quotes "Pool rewards are set by the creator". The approved 089 boards and the 089 approved QA use the newer house line from Rob's 29 Sep calls, which is `TESTNET_NOTICE`: "Testnet only. tREVO has no cash value. Pool rewards come from the network, vary, and are not guaranteed." The build uses `TESTNET_NOTICE` in the referral review and the conversion review. Swapping it is one constant if the lead wants the older line.
- 089 I02 asks for the lock when moving from Select to Review. #232 already locks when Process is pressed, before the panel and before any wallet opens. That is earlier and is kept.
- The value panel is the shared modal SidePanel, so the queue does not reflow beside it as drawn on the board.
- Broadcasts is not in the review rows; it stays in the rail under Content so its page remains reachable.
- The users table no longer shows the Referrer column (not in 087 I15); the CSV export keeps it.
- Files show the owner's name; the files API returns no handle.
- `react-hot-toast` is no longer imported by admin; the dependency is left in package.json to avoid a lockfile change.
- First party in the OAuth chips means every redirect URI is on amped.bio, the same rule as D1.

## Waits

- 094 D1 counsel items: which hosts count as Amped.Bio (only amped.bio and its subdomains today, in `AMPED_BIO_FIRST_PARTY_HOSTS`), and whether a first party app may receive the wallet address without a consent screen.
- 094 D1 Connected apps listing every app a person used, including skip consent apps, is row 092. Not in this batch.
- Existing skip consent clients whose redirect URIs are not https on amped.bio (for example a native app scheme) keep working, but any update to them now fails until skip consent is unchecked.
- `VITE_PANEL_URL` values: staging `https://app.staging.amped.bio`, production `https://app.amped.bio`. Confirm production.

## How to test on staging

1. Open https://admin.staging.amped.bio: the rail with four groups, the top bar title, Refresh refetching without a reload, Open editor opening https://app.staging.amped.bio. Try Cmd or Ctrl plus Alt plus D, U, T, F, P, N, O. Open /blocks: it lands on Dashboard.
2. Dashboard: block one API call in devtools (for example `admin.users.getTopHandles`): only Top handles shows its error card with Retry. Turn off faucet asks first. Change a referral reward: the review shows before and after, nothing changes until Change rewards. Clear the message with Show on the editor checked and press Publish: the field error.
3. Users: chips, Show emails, Export both scopes, sort from headers. Block a user: badge changes and Undo. Turn off two factor: destructive Dialog.
4. Themes: two tabs, New theme page, submit without a thumbnail for the field error, create a theme for the toast. Delete a theme with one confirm. Collections: uncheck Visible in gallery for Undo.
5. Files: filters, Preview and Download, Delete with the destructive Dialog and the toast.
6. Pools: the notice and Show them, Set creation tx with Find on chain, Hidden from Explore with Undo, a Sync to the Summary and Done.
7. ndau conversions: Pending by default. Process with MetaMask on another network: Switch to Libertas Testnet, Review, check the box, Send, Conversion processed. Decline in the wallet once: You cancelled in your wallet. Nothing moved.
8. OAuth clients: create a client with https://tidecircle.app/cb: Skip the consent screen is disabled. Create one with https://app.staging.amped.bio/cb and skip consent: the notice, then the Credentials step with Copy. Call `admin.oauthApps.updateClient` with skip_consent true and a non Amped.Bio URI: BAD_REQUEST with the D1 message.
9. At 390: the dock with More, no sideways page scroll, slabs scroll inside themselves.

Screenshots are not included.
