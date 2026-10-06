# Batch 12f: RNS Identity, Attributes and Facets (Screen Review 103 to 106)

Stacked on 12c (`ui/prism-rns-name-page`, #269) and carries #265 (`fix/rns-attributes-owner-only`), because the Identity tab reads `authbase.getMyStatus`. Merge #265 and the RNS stack (#266, #268, #269) first; this PR then shows only the 12f changes. Behind `VITE_SHOW_RNS` and `VITE_RNS_IDENTITY` (both on in development and staging, off in production).

## What changes

| Piece | File | Rule |
|---|---|---|
| Tabs | `wallet/rns/name/NamePage.tsx`, `route.ts` | Profile, Identity, Attributes (Soon), Facets (Soon) in the Prism tabs container, state in `&view=`. Shown to everyone (105 D1, Rob 3 Oct). A hidden view requested by URL falls back to Profile |
| Identity, two views | `wallet/rns/identity/IdentityTab.tsx` | The owner (connected wallet owns the name) reads `authbase.getMyStatus`, keyed by the session wallet on the server. Everyone else reads the public status card: name, Verified or Not verified, valid until, the not an endorsement line. No plans, prices or attributes for visitors (103 I02). Verified needs the name bound to the owner's wallet (104 I12) |
| Not verified (103) | `IdentityPromo.tsx` | Hero with one filled button, Verify with Authbase. Linked but not verified reads Finish verifying with Continue on Authbase (I16). After you verify preview slab. Benefit tiles gated to what ships: Senders see a verified owner, Harder to impersonate (rewritten per I09), Prove facts (Coming soon). Choose a check: tREVO and USD toggle, USD default (103 D1 as changed by Rob), Standard and Enhanced cards with dashed price chips, the pay note with the J0 line verbatim. How it works (no fixed period, no signature claim, I13). What Amped.Bio receives with the Privacy Policy link |
| Verified (104) | `IdentityVerified.tsx` | Status card: tier, verified on, valid until, linked wallet with copy, the disclaimer. Renew is a disabled secondary until 30 days before valid until, then the primary. No filled button while current (I15). Where your badge shows: the send row, checked and locked (110 D1). Badge details disclosure with the token, minted date and View transaction; Badge being issued without a badge (I10) |
| Shared attributes | `SharedAttributes.tsx` | Owner only. Name and Country labeled; other keys counted, never shown raw (104 I09). Helper: Only you can see these. Others see only your verification status |
| States | `IdentityTab.tsx` | Loading skeleton, Authbase unavailable with Retry, account without a wallet, name not pointing to a wallet, name pointing to another wallet. Without `VITE_AUTHBASE_URL` the owner sees the status card and no CTA (103 I18) |
| Attributes (105) | `AttributesTab.tsx`, `catalog.ts` | Intro card with Coming soon and Notify me, the nine planned attributes as a list (full opacity icons, example facets as badges, no per card status), the not verified line with Go to Identity, the footer rule. No "vault" (I05) |
| Facets (106) | `FacetsTab.tsx` | Hero 26/33 with Notify me, How a proof works with the I01 wording and no technical caption, Your facets read only with one Coming soon badge each, Planned uses. No switches and no proof log in the placeholder phase (I03) |
| Notify me | `parts.tsx`, `useIdentityInterest.ts`, `apps/server/src/trpc/authbase.ts` | `authbase.identityInterest` and `authbase.setIdentityInterest` (private). One record per account, shared by both tabs. Default, saving, On with Turn off, error with Retry (105 I04) |
| Data | `schema.prisma`, migration `20261005130000_add_feature_interest` | New `FeatureInterest` (user, feature, source, created_at, notified_at), unique per user and feature |
| Removed | `components/rns/verification/VerificationDetails.tsx` | The legacy Identity view |
| Tests | `apps/server/src/__tests__/authbase-identity.test.ts` | Public lookup has no attributes; getMyStatus uses the session wallet and returns null with none; Notify me needs a session, is one record across tabs and per account |

## Not in this PR

- Paid check through Authbase checkout (103 I01, D1). Authbase has no checkout or price API yet. Verify opens Authbase in a new tab; prices show as placeholders. The value panel flow (Check, Review, Pay on Authbase) and `AUTHBASE_CHECKOUT_ENABLED` come with that API.
- Returned from checkout state (103 I17). Needs the checkout API.
- Badge on your page row and its setting (104 I03, I04). It is the same setting as 108 Show Verified badge, so it ships with 12d and its schema change.
- In apps you sign in to with Amped.Bio row (104 I08). Waits for the verified claim (091).
- The launch email for Notify me (`sendRnsIdentityLaunchEmail`). The table keeps `notified_at` for it.
- `VITE_AUTHBASE_URL` in `apps/client/.env.production`. The production Authbase URL is not known yet.

## For Gustavo

- Run the migration. It adds one table; it does not change `users`.
- `FeatureInterest` sits after `Referral`, before `Jwks`, and its relation line sits under `referralsMade`. That keeps it clear of `UserOnboarding` from #267, so `schema.prisma` merges cleanly.

## For counsel

- The attribute list (Accredited investor (US), AML screening, Not a politically exposed person, Citizenship) and the Gated pools tile, before the tabs reach production (105 I11, 106 I06).
- The USD and tREVO pairing on Choose a check (103 D1).

## Checks

- Turbo typecheck, client `tsc -b`, client and server builds, eslint, server tests (`authbase-identity`, `rns-binding`: 31 pass).
- Harness at 1440 and 390, no horizontal scroll: four tabs, not linked owner, linked owner, verified with badge, verified without badge, renewal window open, name pointing elsewhere, Authbase down, loading, no wallet, visitor verified and not verified, Attributes with Notify me on and failed, Facets sharing Notify me, visitor Facets without Notify me.
