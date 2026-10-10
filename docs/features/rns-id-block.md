# RNS ID block

Status: built 2026-10-10, behind `VITE_SHOW_RNS` and `NEXT_PUBLIC_SHOW_RNS` (the same flags as the header chip). Build Board item #33, Screen Review row 112.
Owner: Rob Frasca. Concepts and build by Claude, 2026-10-10. Decisions 112 D1 to D6 approved by Rob on 10 Oct 2026.
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
2. **Verified cannot be hidden on the block.** The block reads `rns_display` (108 I04). Show Verified badge off means the block reads Linked name, the same as the header chip. No second switch.
3. **Default tap opens the identity sheet.** `RnsIdentityDialog` is the chip's dialog, extracted so the block and the chip share it. Expand in place is offered for ID Card and Proof Strip; Nothing for Nameplate and Seal.
4. **Linked but not verified shows as Linked name.** Not bound, expired, Show on my page off or no wallet: `identity` is null and the block renders nothing; the editor explains why and links to Page > RNS or Wallet.
5. **Lapsed verification drops the chip, Name on ID and the check at once.** Already how the read model behaves: the verification cache is capped at `valid_until`, the binding cache evicts on expiry, no grace period.
6. **A block, one per page, placed anywhere.** The header chip stays as it is.
7. **Open (counsel).** With `RNS_PUBLIC_ATTRIBUTES` on, `authbase.getWalletStatus` returns name and country for every Verified wallet, whatever the page owner chose. Recommendation on the Build Board card: the owner's Name on ID switch should govern that lookup too. Not changed in this build.

## 3. Data model

No new tables. Block config (JSON on the block row), validated by `rnsIdConfigSchema`:

```ts
export type RnsIdBlockConfig = {
  style: "nameplate" | "idcard" | "proofstrip" | "seal";  // default nameplate
  label: string;                                           // 1 to 24, default Identity (ID Card, Proof Strip)
  tap: "sheet" | "inline" | "none";                        // default sheet; rnsIdTapsFor(style) lists the allowed values
  show: {
    displayName: boolean;  // default true (ID Card)
    avatar: boolean;       // default true (ID Card)
    since: boolean;        // default true, the month the page joined
    nameOnId: boolean;     // default false (112 D1)
  };
};
```

Server additions:

- `PublicRnsIdentity.nameOnId?: string` (getHandle `user.identity`). Set only by `computeRnsIdentity` when the chip is verified, `block.nameOnId` is true and the cached verification carries a name.
- `RnsVerification` (verified) gains `nameOnId?: string`, read once per wallet with the 5 minute cache, under `RNS_PUBLIC_ATTRIBUTES` only.
- `rnsIdBlockOptions(blocks)` reads the block's switch from the page's rows; a hidden block asks for nothing.
- getHandle returns `user.since` ("YYYY-MM" from `created_at`). `rns.getMyPageIdentity` returns `since` and `nameOnIdAvailable` (flag on, verified, Authbase shared a name) so the editor can disable the switch with a reason.

## 4. Where the code lives

| Piece | Path |
| --- | --- |
| Block type, schema, defaults, `rnsIdTapsFor`, `SINGLETON_BLOCK_TYPES` | `packages/constants/src/blocks.ts` |
| Name on ID rule, `rnsIdBlockOptions`, `nameOnId` on the verification | `apps/server/src/services/rnsIdentity.ts` |
| Block switches read before the identity; `user.since` | `apps/server/src/trpc/handle.ts` |
| Preview parity: block switches, `since`, `nameOnIdAvailable` | `apps/server/src/trpc/rns.ts` |
| Config defaults on save and serve | `apps/server/src/utils/sanitizeBlockConfig.ts` |
| Shared card, four styles, inline facts | `packages/ui/src/creator/rns-id-card.tsx` |
| Identity dialog extracted from the chip, Name on ID fact | `packages/ui/src/prism/rns-identity.tsx` |
| Public page renderer | `apps/landingpage/src/components/blocks/RnsIdBlock.tsx`, `ProfileView.tsx`, `lib/profilePageData.ts` |
| Editor: Add block Identity, row, fields, preview | `apps/client/src/components/panels/page/blocks/AddBlockDialog.tsx`, `BlocksSection.tsx`, `BlockRow.tsx`, `blockInfo.ts`, `BlockFields.tsx`, `RnsIdBlockFields.tsx`; `apps/client/src/components/blocks/RnsIdBlock.tsx`; `Preview.tsx` |
| Tests: Name on ID gating, `rnsIdBlockOptions` | `apps/server/src/__tests__/rns-identity.test.ts` |

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

## 9. Later

- Proofs (facets) and Agents rows once the Authbase proof API (107) and RNS subnames exist. The card's Proof Strip is ready to take more proof chips.
- 112 D7 with counsel and the 079 D2 Privacy Policy change.
