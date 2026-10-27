# Batch 12d: RNS on the Page and the public identity sheet (Screen Review 108, 109)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

## Rows

| Row | Screen | Result |
|---|---|---|
| 108 | Page > Profile: Revolution Name Service (RNS) section | Built |
| 109 | Public page: RNS chip and identity sheet | Built. The Verified chip needs `RNS_PUBLIC_IDENTITY=true` on the server |

Decisions applied: 108 D1 and 109 D2 (one Prism Switch for settings that apply at once), 109 D1 (counsel wording, approved 3 Oct 2026).

## What changed

### Server

| Piece | File | Rule |
|---|---|---|
| Display record | `packages/database/prisma/schema.prisma`, migration `20261006120000_add_rns_display` | `User.rns_display` JSON `{showName, showBadge, details: {name, wallet, check}}`. NULL reads as all on (108 I04) |
| Identity rule | `apps/server/src/services/rnsIdentity.ts` (new) | One function builds the public identity for getHandle, the editor preview and the Page section. Chip null unless the binding holds now (owner and resolver addr equal UserWallet.address, registration not expired, no grace) and Show on my page is on. Chip `verified` only when Authbase returns VERIFIED or VERIFIED_WITH_BADGE and Show Verified badge is on. `name`, `wallet` and `check` only when their detail switch is on; `check` only when verified. Never attributes, message or the Authbase wallet. Authbase results cached 5 minutes per wallet; a failed read gives the name chip; a failed chain read gives no chip (109 I01, I13) |
| Feature flag | `apps/server/src/env.ts`, `.env.example` | `RNS_PUBLIC_IDENTITY` (default false). Off: the page shows the name chip only and never calls Authbase |
| Public payload | `apps/server/src/trpc/handle.ts` | `getHandle` returns `user.identity`. `revoName`, `revoNameStatus` and `originalRevoName` are gone from the public response (108 I02) |
| Name write | `apps/server/src/trpc/user.ts`, `schemas/user.schema.ts` | New `user.setRnsName({label | null})` checks the binding against the account wallet and stores the label only; any failed read refuses. `revo_name` is removed from `user.edit` (an older client that still sends it is ignored) (108 I01) |
| Display write | same | New `user.setRnsDisplay` (108 I04) |
| Owner reads | `apps/server/src/trpc/rns.ts` | `rns.listMyNames`: names owned by UserWallet in the subgraph, each with expiry, state (linked, not linked, expired, could not check) and Primary (108 I03). `rns.getMyPageIdentity`: stored name and its state now, Authbase status without attributes, display record, and the public identity for the preview (108 I07, I08, I11) |
| Copy | `packages/web3/src/rns.ts` | No wallet reads Add a wallet to use an RNS name. |
| Tests | `apps/server/src/__tests__/rns-identity.test.ts` | Every switch combination returns only allowed fields; no wallet, grace, owned elsewhere, pointing elsewhere and read failure show no chip; Authbase lapsed, down, unconfigured or flag off show the name chip |

109 I02 (attributes stripped from the public `authbase.getWalletStatus`) was already in development.

### Shared UI

| Piece | File | Rule |
|---|---|---|
| Prism Switch | `packages/ui/src/Switch.tsx` | 44 x 26 track in a 44 target. Off: white with a 1.5px rgba(22,21,43,0.56) ring and an ink-2 knob. On: nav with a white knob. 233ms, none under reduced motion. With a label the whole row toggles; the helper is announced through aria-describedby (108 I05, I13). Admin switches pick up the new look; the label now sits left of the switch |
| Chip and sheet | `packages/ui/src/prism/rns-identity.tsx` (new) | `RnsIdentityChip`: one 44 pill button in the creator font and color, ring at the creator color 0.40, no hero effect, aria-haspopup dialog (109 I06, I07). It opens the shared Dialog: bottom sheet on phones, 508 dialog above (I08, I17), 377ms. Verified sheet: badge--success Verified, Identity verified, the counsel body, ID checked by Authbase / Valid until, Pay by name, Show details, Send, J0, the not an endorsement footnote (I03, I04, I09). Name sheet: This name points to this page's wallet. and the caution line, no footnote (I10). Show details is the Switch, off each time the sheet opens, absent when the server sent no detail fields (I11). Details card: 44 rows, copy buttons with Copied, check dates and level, View on Revolution Name Service (I12). `RnsVerifiedMark`: the 21 check after the display name, aria-hidden (I07, 108 I19) |
| Copy in one place | same, `RNS_IDENTITY_COPY` | The counsel slots (chip, title, body, fact label) live here (109 I03) |

### Client (editor)

| Piece | File | Rule |
|---|---|---|
| RNS section | `apps/client/src/components/panels/page/rns/RnsSection.tsx` (new) | Own G1 clear card under the profile header card: IDENTITY ON YOUR PAGE, Revolution Name Service (RNS), lead line (108 I12). RNS name select from `rns.listMyNames`: linked names enabled, Points to another wallet and Expired <date> disabled, Verified and Primary badges on the selected value only, no None option (I03, I10, I17). Linked, Not linked, Checking and Could not check lines (I07). Expired or lost name notice with Manage in Wallet and dismiss (I15). Show on my page, Show Verified badge (helper Verified by Authbase until <date>), or Not verified with Get verified (opens the name's Identity tab), or We could not check your verification. with Retry (I08). Details group only while Show on my page is on; Check dates and level only when verified; wallet helper Fans can copy it. (I09). States: no wallet, no names, loading, list failed (I14). Display switches autosave 800ms after a change (I04) |
| Data | `rns/useMyPageIdentity.ts` (new) | One query for the section and the preview |
| Header card | `header/ProfileHeaderCard.tsx`, `PagePanel.tsx` | Photo, name, handle and bio only. `RevoNameField.tsx` is removed (I12) |
| Preview | `apps/client/src/components/Preview.tsx` | The duplicated chip markup is replaced by `RnsIdentityChip` fed by `rns.getMyPageIdentity`, so a switch change shows the chip exactly as the public page will. The sheet opens read only (108 I11, 109 I14) |
| Editor state | `contexts/EditorContext.tsx`, `design/kit/useThemeActions.ts` | Autosave no longer sends `revo_name`. `clearRevoName` (Wallet transfer) uses `user.setRnsName`. The stored name loads from the owner read |

### Landing (public page)

| Piece | File | Rule |
|---|---|---|
| Chip | `apps/landingpage/src/components/ProfileView.tsx`, `lib/profilePageData.ts` | The copy icon, green check and external link are replaced by `RnsIdentityChip` and the verified mark. `NEXT_PUBLIC_SHOW_RNS` off renders nothing (109 I06, I13) |
| Send | same | Send tREVO to <display name> opens `/wallet?send=1&to=<label>` in the editor (the Send flow already reads `to`, 110 I01). Signed out visitors pass through sign in and return there (109 I05) |

## Instruction coverage

| Row | Id | Where |
|---|---|---|
| 108 | I01 | `user.setRnsName` |
| 108 | I02 | `computeRnsIdentity` in `getHandle`; private status in `rns.getMyPageIdentity` |
| 108 | I03 | `rns.listMyNames`, the select |
| 108 | I04 | `User.rns_display`, `user.setRnsDisplay`, 800ms autosave |
| 108 | I05, I13 | Prism Switch |
| 108 | I06 | No Show facets row |
| 108 | I07 to I10, I14 to I18 | `RnsSection` |
| 108 | I11, I19 | `Preview` with `RnsIdentityChip` and `RnsVerifiedMark` |
| 108 | I12 | Section card under the header card |
| 109 | I01 | `computeRnsIdentity`, `RNS_PUBLIC_IDENTITY` |
| 109 | I02 | Already in development |
| 109 | I03, I04, I06 to I12, I15 to I17 | `rns-identity.tsx` |
| 109 | I05 | Send link in `ProfileView` |
| 109 | I13 | Server fallbacks and the `NEXT_PUBLIC_SHOW_RNS` gate |
| 109 | I14 | One component in `ProfileView` and `Preview` |

## Notes

- Privacy: the public page shows only the verification status, its dates and level, the RNS name and the wallet address, each as the owner allows. This matches the published notice (section 2, Authbase: "Others see only your verification status, and only where you choose to show it"; recipients table: the public sees "the verification status you choose to show" and the wallet address). No Authbase attribute leaves the server. No notice change is needed.
- Staging needs `RNS_PUBLIC_IDENTITY=true` on the API to show the Verified chip. Production stays off until you turn it on.
- The migration adds one nullable column. Run `prisma migrate deploy` before the server deploys.
- The shared Dialog switches to the bottom sheet below 640, not 768 as 109 I08 asks. Changing it would move every dialog in the product; flagged for a system decision.
- Copy feedback in the sheet is an inline Copied state on the button (announced), not a toast. The landing page and the editor use different toast systems.
- With the Verified chip on and the RNS name hidden in details, the sheet has no name to send to, so Send uses the wallet when shown and is absent when both are hidden.
- A save failure on the display switches shows Could not save with Retry inside the section, not in the top bar.
- The section helper under Show on my page and the lead line are new copy: "Fans see the RNS name under your display name." and "Choose the RNS name your page shows and what fans can see."
- 102 (the Wallet name page) still has its own On your page card. It should write the same `rns_display` record in a follow up.

## Waits

- #282 also edits `ProfileView.tsx` (follow capsule, video backdrop) and `Preview.tsx` (background layer). The hunks do not overlap; land #282 first and this rebases cleanly, or the other way round.
- #284 edits `EditorContext.tsx` (kept edits, session ended). Whichever lands second needs a small rebase in `setUser` and the save path.

## How to test on staging

1. Set `RNS_PUBLIC_IDENTITY=true` on the staging API and run the migration.
2. Signed in with a wallet that owns an RNS name, open https://app.staging.amped.bio/page: the RNS card sits under the profile card. Pick the name: Linked. This name points to this page's wallet.
3. Turn each switch off and on: the preview chip changes within a second; reload the public page and the sheet shows only the allowed rows.
4. Call `handle.getHandle` for that page in DevTools with Show details switches off: `identity` has no `wallet` or `check`.
5. With MetaMask connected to another account, the select still lists the account wallet's names.
6. On https://staging.amped.bio/<handle>, tap the chip: the sheet opens with focus inside, Escape closes it and focus returns to the chip. Below 640 it is a bottom sheet.
7. Signed out, tap Send tREVO: sign in, then the editor opens Send with the name filled in.
8. A wallet with no Authbase check: the chip reads the RNS name and the sheet shows the caution line.

Screenshots are not included.
