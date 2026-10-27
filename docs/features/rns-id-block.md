# RNS ID block

Status: built 2026-10-10, behind `VITE_SHOW_RNS` and `NEXT_PUBLIC_SHOW_RNS` (the same flags as the header chip). Build Board item #33, Screen Review row 112.
Owner: Rob Frasca. Concepts and build by Claude, 2026-10-10. Decisions 112 D1 to D6 approved by Rob on 10 Oct 2026; D8 and D9 approved on 21 Oct 2026 (section 8b).
Parent: RNS as Amped.Bio identity (Build Board #25), rows 108 (Page > RNS) and 109 (public identity sheet). This document adds a block on top of that read model; it changes none of its rules.
Concept boards: https://claude.ai/artifact/UGmNDUJefvSDb3Aqt23rHU. Staging code review: project doc `claude/amped-rns-staging-review-2026-10-10.md`.

## 1. What ships

One block a creator adds from Add block, under a new Identity eyebrow (`type = "rnsid"`). It shows who runs the page, from the same server identity the header chip uses. A singleton, like referral, follow and followers.

Four styles in the creator's theme:

1. **Nameplate** (default). One line: shield, the RNS name, the Verified or Linked name chip, and a second line (Name on ID when allowed, otherwise "Name points to this page").
2. **ID Card.** Avatar, label eyebrow, display name, the checked name or "ID checked by Authbase", the month the page joined, the RNS name with its chip, stamps (ID checked with the Authbase date, Name points to this page), and Valid until.
3. **Proof Strip.** A label and a scrolling row of proofs: Verified ID (Authbase, date), Name on ID, Name points here.
4. **Seal.** An SVG ring reading REVOLUTION NAME SERVICE · VERIFIED (or LINKED NAME) around the name, beside "Identity verified" or "Linked name" and one sentence built from what the owner allowed.

A tap opens the identity sheet (the same dialog as the header chip), expands the facts in place (ID Card and Proof Strip), or does nothing (Nameplate and Seal).

## 2. Decisions (112)

1. **Name on ID.** Shown only from the name Authbase checked, only on the Verified chip, only when the owner's block switch is on, and only while `RNS_PUBLIC_ATTRIBUTES` is on (079 D2). Off by default. Never on the name chip, never in the linked or lapsed state. Source: `publicSharedAttributes(status.attributes).name`, carried on the cached verification and applied in `computeRnsIdentity`. The raw public lookup is never read by the block.
2. **Verified cannot be hidden on the block.** The block reads `rns_display` (108 I04). Show Verified badge off means the block reads Linked name, the same as the header chip. No second switch. Since 21 Oct it never reads Not verified in that case (D8).
3. **Default tap opens the identity sheet.** `RnsIdentityDialog` is the chip's dialog, extracted so the block and the chip share it. Expand in place is offered for ID Card and Proof Strip; Nothing for Nameplate and Seal.
4. **Linked but not verified shows as Linked name.** Not bound, expired, Show on my page off or no wallet: `identity` is null and the block renders nothing, unless the check is current (D9); the editor explains why and links to Page > RNS or Wallet.
5. **Lapsed verification drops the chip, Name on ID and the check at once.** Already how the read model behaves: the verification cache is capped at `valid_until`, the binding cache evicts on expiry, no grace period.
6. **A block, one per page, placed anywhere.** The header chip stays as it is.
7. **Closed 21 Oct (PR #341).** `authbase.getWalletStatus` now returns only the attributes the owner switched on in their RNS ID block.
8. **Badge off, attributes on (21 Oct).** A current check with Show Verified badge off sets `identity.checkHidden`. The card drops the Verified chip and shows a neutral line in place of the Not verified caution. Attribute rows keep "as checked by Authbase".
9. **Verified without a linked name (21 Oct).** A visible RNS ID block on a current check gets an identity with `linked: false`: the check, the badge and the shared attributes, never a name, a "points here" line or a pay row. With the badge off and no shared attribute on, nothing shows. The header chip keeps to a linked name (`headerRnsIdentity`).

## 3. Data model

No new tables. Block config (JSON on the block row), validated by `rnsIdConfigSchema`:

```ts
export type RnsIdBlockConfig = {
  style: "nameplate" | "idcard" | "proofstrip" | "seal"; // default nameplate
  label: string; // 1 to 24, default Identity (ID Card, Proof Strip)
  tap: "sheet" | "inline" | "none"; // default sheet; rnsIdTapsFor(style) lists the allowed values
  show: {
    displayName: boolean; // default true (ID Card)
    avatar: boolean; // default true (ID Card)
    since: boolean; // default true, the month the page joined
    nameOnId: boolean; // default false (112 D1)
  };
};
```

Server additions:

- `PublicRnsIdentity.nameOnId?: string` (getHandle `user.identity`). Set only by `computeRnsIdentity` when the chip is verified, `block.nameOnId` is true and the cached verification carries a name.
- `RnsVerification` (verified) gains `nameOnId?: string`, read once per wallet with the 5 minute cache, under `RNS_PUBLIC_ATTRIBUTES` only.
- `rnsIdBlockOptions(blocks)` reads the block's switch from the page's rows; a hidden block asks for nothing.
- getHandle returns `user.since` ("YYYY-MM" from `created_at`). `rns.getMyPageIdentity` returns `since` and `nameOnIdAvailable` (flag on, verified, Authbase shared a name) so the editor can disable the switch with a reason.

## 4. Where the code lives

| Piece                                                                 | Path                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block type, schema, defaults, `rnsIdTapsFor`, `SINGLETON_BLOCK_TYPES` | `packages/constants/src/blocks.ts`                                                                                                                                                                                                    |
| Name on ID rule, `rnsIdBlockOptions`, `nameOnId` on the verification  | `apps/server/src/services/rnsIdentity.ts`                                                                                                                                                                                             |
| Block switches read before the identity; `user.since`                 | `apps/server/src/trpc/handle.ts`                                                                                                                                                                                                      |
| Preview parity: block switches, `since`, `nameOnIdAvailable`          | `apps/server/src/trpc/rns.ts`                                                                                                                                                                                                         |
| Config defaults on save and serve                                     | `apps/server/src/utils/sanitizeBlockConfig.ts`                                                                                                                                                                                        |
| Shared card, four styles, inline facts                                | `packages/ui/src/creator/rns-id-card.tsx`                                                                                                                                                                                             |
| Identity dialog extracted from the chip, Name on ID fact              | `packages/ui/src/prism/rns-identity.tsx`                                                                                                                                                                                              |
| Public page renderer                                                  | `apps/landingpage/src/components/blocks/RnsIdBlock.tsx`, `ProfileView.tsx`, `lib/profilePageData.ts`                                                                                                                                  |
| Editor: Add block Identity, row, fields, preview                      | `apps/client/src/components/panels/page/blocks/AddBlockDialog.tsx`, `BlocksSection.tsx`, `BlockRow.tsx`, `blockInfo.ts`, `BlockFields.tsx`, `RnsIdBlockFields.tsx`; `apps/client/src/components/blocks/RnsIdBlock.tsx`; `Preview.tsx` |
| Tests: Name on ID gating, `rnsIdBlockOptions`                         | `apps/server/src/__tests__/rns-identity.test.ts`                                                                                                                                                                                      |

## 5. Wording

Reuses `RNS_IDENTITY_COPY` (counsel approved 3 Oct). New strings, for counsel before the flag goes on in production: "Linked name", "Name on ID", "{name}, as checked by Authbase.", "Name points to this page", "ID checked", the seal ring text "REVOLUTION NAME SERVICE · VERIFIED" and "REVOLUTION NAME SERVICE · LINKED NAME". No "trusted", "safe" or "official" anywhere.

## 6. Theme and Prism

The card wears only the creator's theme: surface in the button color at the container transparency, text in the creator's font and color, hairlines and stamps from the font color at low alpha. The Verified chip and the seal's check disc are the one fixed pair (#E6F2EA on #0F4A2C, 4.5:1 on light and dark creator themes). Targets 44 minimum on the block, the inline Full details button and the sheet switch. The sheet is the Prism dialog from row 109.

## 7. Acceptance walk (staging)

1. Add block, Identity, RNS ID. The row opens; the preview shows the block only when Page > RNS has a linked name with Show on my page on.
2. Each style renders in the preview and on the public page with the same fields; a creator theme change recolors the block.
3. Verified page: chip reads Verified, ID Card shows the Authbase date and Valid until. Show Verified badge off in Page > RNS: the block reads Linked name.
4. Name on ID: disabled with "Not available yet" while `RNS_PUBLIC_ATTRIBUTES` is off; with it on and a verified wallet that shared a name, the switch enables and the name shows on the Verified chip only. The public getHandle payload never carries `nameOnId` with the switch off.
5. Tap: sheet opens the identity dialog (Send live on the page, inert in the preview); inline opens the facts under the block with Full details; none renders a static card.
6. Not bound, expired or Show on my page off: nothing on the public page; the editor notice names the reason and links to the fix.
7. Hide the block: the public payload drops `nameOnId` (a hidden block asks for nothing).

## 8. Validation (10 Oct 2026)

Typecheck clean for `@repo/constants`, `@repo/ui`, server, client and landingpage. Server `tsc` build, client `vite build --mode staging` and landing `next build` pass. Server unit tests 260 pass (the two live API suites need staging and are excluded here). Prettier and eslint on changed files: no errors; the remaining warnings predate this change. The card was rendered server side in 24 variants (4 styles, verified and linked, 3 taps) with no undefined or NaN output.

## 8a. Privacy record (review, 11 Oct)

- `user.since` (the join month) leaves the server only when the page carries a visible RNS ID block; a page without the block exposes no join month. Both `getHandle` and `rns.getMyPageIdentity` gate on `rnsIdBlockOptions(...).visible`.
- `nameOnId` is re-checked against `RNS_PUBLIC_ATTRIBUTES` at read time, so a verification cached while the flag was on cannot release the name after the flag turns off (cache entries live up to 5 minutes).

## 8b. Badge and status (21 Oct 2026)

What Authbase sends: `NOT_LINKED`, `NOT_VERIFIED`, `VERIFIED`, `VERIFIED_WITH_BADGE` (the last with a badge tier, token id and mint date). Before this change the page identity dropped the badge, so only the Wallet Identity tab showed it.

Server (`apps/server/src/services/rnsIdentity.ts`):

- `RnsVerification` (verified) gains `badge?: { tier, mintedAt }`. The token id stays on the server.
- New `RnsVerification` state `expired` with `validUntil`: Authbase still reports VERIFIED\* but `valid_until` has passed by this server's clock. Authbase flips to `NOT_VERIFIED` with no dates, so this is only seen in that window. Visitors see it as not verified; the owner sees Check expired and Renew.
- `PublicRnsIdentity` gains `linked`, `checkHidden`, `badge`, and the chip value `none` (no linked name, no Verified claim, shared attributes only).
- Explore person cards take a linked identity only.

Card (`packages/ui/src/creator/rns-id-card.tsx`), per style:

| Style       | Verified with badge                                              | Verified                   | Badge hidden (D8)                              | No linked name (D9)                         |
| ----------- | ---------------------------------------------------------------- | -------------------------- | ---------------------------------------------- | ------------------------------------------- |
| Nameplate   | Badge glyph, Verified chip, "Enhanced ID check · Badge on chain" | Verified chip, check level | Linked name chip, attributes                   | Display name, Verified chip or details only |
| ID Card     | ID checked stamp with level and date, Badge stamp, Valid until   | ID checked stamp           | Linked name, attribute stamps, no Not verified | No "Name points to this page" stamp         |
| Proof Strip | Verified ID with level, Badge on chain with mint date            | Verified ID                | Attribute proofs                               | No "Name points here" proof                 |
| Seal        | Inner ring solid, "Badge minted {date}"                          | Ring VERIFIED              | Ring LINKED NAME                               | Ring ID VERIFIED or SHARED BY THE OWNER     |

Sheet (`packages/ui/src/prism/rns-identity.tsx`): Verification badge fact and Badge minted and Badge level detail rows; Shared details title for chip `none`; the neutral line for D8; no pay row without a linked name.

Editor (`RnsIdBlockFields.tsx`, `RnsSection.tsx`): notices for verified with or without a badge, expired with Renew, D8 and D9. Page > RNS adds Check expired with Renew verification.

New strings for counsel: "Verification badge", "Minted on chain on {date}.", "Badge", "Badge on chain", "Badge minted {date}", "{Level} ID check", "Shared details", "The owner of this page shared these through Authbase.", "Details shared by the owner", "Check the address with the owner before you send. Names can look alike." (the approved caution without "Not verified."), "Check expired", ring text "ID VERIFIED · AUTHBASE" and "SHARED BY THE OWNER · AUTHBASE".

Privacy: no notice change. The notice already says Amped.Bio receives the verification status and badge, and that the public sees the verification status the owner chooses to show. The badge follows Show Verified badge. D8 note for counsel: the neutral line differs from the Not verified caution, so a visitor can infer a hidden check; shared attributes already imply it.

Acceptance walk additions:

1. A VERIFIED_WITH_BADGE wallet: each style shows the badge; the sheet shows Verification badge with the mint date. A VERIFIED wallet shows no badge and the editor says the badge shows once Authbase mints it.
2. Show Verified badge off: no Verified chip, no badge, no Not verified anywhere on the card or sheet; switched on attributes still show.
3. Clear the RNS name on a verified page with the block visible: the block shows the check without a name; the header chip is gone; the sheet has no Send. Hide the block: nothing.
4. Badge off and no name: nothing unless an attribute is switched on and shared.

## 9. Later

- Proofs (facets) and Agents rows once the Authbase proof API (107) and RNS subnames exist. The card's Proof Strip is ready to take more proof chips.
- 112 D7 with counsel and the 079 D2 Privacy Policy change.
