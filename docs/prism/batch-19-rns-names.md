# Batch 19: RNS names, search and the name and address views (Screen Review 077, 079)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

## Rows

| Row | Screen                                                                                         | Result                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 077 | RNS home and name search (`/rns`, now `/wallet?tab=rns`)                                       | Built. Most of the row shipped in 12b (row 101). This PR adds the approved About names answers, removes the RNSHeader stub and accepts `?tab=names`                                                                                                              |
| 079 | My names, name detail and address view (`/rns/*`, now `/wallet?tab=rns&name=` and `&address=`) | Built where missing. My names, the address list and the detail shipped in 12b, 12c and 12f (rows 101, 102, 111, 103, 104). This PR adds the D2 attribute rule, the address header primary name, Not available dates, the hex token ID and Find your own RNS name |

Rows 100 to 111 were evaluated after 077 and 079 and already shipped. Where they set a different rule, the later approved row stands and is listed under Notes.

## Decisions applied

- 077 D1 (wording approved 7 Oct 2026): About names shows exactly three rows with the approved answers. The cost answer ends with the testnet line verbatim (`TESTNET_NOTICE`). Counsel reads them before `VITE_SHOW_RNS` is turned on.
- 079 D1 (recommendation): the expiry filter stays deleted. The address view lists every active name as G0 rows with the Primary badge. The search well renders only at 6 or more names. Already true in `AddressView.tsx` (`SEARCH_FROM = 6`) since 12b; no change.
- 079 D2 (wording approved): shared attributes show only for a Verified status, under SHARED BY THE OWNER, with the sharing line. Never for Not verified or Not linked. The public lookup applies the same rule on the server.

## What changed

### 077

| Piece       | File                                                              | Rule                                                                                                                                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| About names | `wallet/rns/AboutRns.tsx`, `config/rns/copy.ts`                   | Eyebrow ABOUT NAMES. Three disclosure rows 55, one open at a time: What is a name?, How long does a name last?, What does a name cost? Answers as approved in 077 D1. The suffix in the first answer reads from chain config (`.revotest.eth`). The fourth question (What does Verified mean?) is removed (I11, D1) |
| Top bar     | `components/Layout.tsx`, `components/rns/RNSHeader.tsx` (deleted) | The legacy `rns` panel renders only the redirect. No RNS header strip or link in the top bar (I03)                                                                                                                                                                                                                  |
| Names alias | `wallet/ProfileTabs/index.tsx`                                    | `/wallet?tab=names` lands on the RNS tab and keeps `name`, `address` and `flow` (I01)                                                                                                                                                                                                                               |

### 079

| Piece                   | File                                                                                                                             | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attribute rule (server) | `apps/server/src/env.ts`, `.env.example`, `services/authbase.ts`, `trpc/authbase.ts`                                             | New `RNS_PUBLIC_ATTRIBUTES` (default false). On: `authbase.getWalletStatus` returns attributes only for VERIFIED or VERIFIED_WITH_BADGE, filtered to the approved keys (`name`, `country`), empty values dropped. Not verified and Not linked return none. Off: no attributes, as today. `authbase.isConfigured` reports `publicAttributes` (D2, I23)                                                                                                                                                                                                                                              |
| Attribute rule (client) | `identity/SharedAttributes.tsx`, `identity/IdentityTab.tsx`, `identity/IdentityPromo.tsx`, `hooks/rns/useAuthbaseConfigured.tsx` | Eyebrow SHARED BY THE OWNER. Labels from the approved key map; raw keys never show. Visitors see the rows only for a Verified, bound name, and nothing when no approved attribute has a value. With the server rule on, the line reads "The owner shared these through Authbase. Anyone who views this name can see them." With it off, the owner reads the Privacy Policy line "Only you can see these. Others see only your verification status." An owner not yet Verified sees "Details you share through Authbase appear here after your status is Verified." and no attribute rows (D2, I23) |
| Address header          | `wallet/rns/AddressView.tsx`                                                                                                     | With a primary name: the name 26/33 700 with Copy name 44, the address 6 plus 4 with Copy address 44, and View name. Without one: the address 6 plus 4 at 26/33 with Copy address 44 and the line No primary name. Both copies raise Copied. The primary is the forward checked reverse record from `rns.addressSummary` (I21, I25, I16)                                                                                                                                                                                                                                                           |
| Invalid address         | `wallet/rns/AddressView.tsx`                                                                                                     | The card shows the entered value, tabular and break-all (I20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Dates                   | `wallet/rns/name/ProfileTab.tsx`                                                                                                 | Registered, Expires and Grace period ends always show in Name details. An unreadable date reads Not available (I12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Token                   | `wallet/rns/name/ProfileTab.tsx`                                                                                                 | Token ID in decimal and in hex, each with a 44 copy button and its own label (I13, I16)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Header for visitors     | `wallet/rns/name/NameHeader.tsx`, `NamePage.tsx`                                                                                 | A viewer who does not own the name gets a ghost Find your own RNS name that returns to the search (I08)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Instruction coverage

### 077

| Id  | Status      | Where                                                                                                                                                                                                                                  |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I01 | Done        | RNS is the third Wallet tab behind `VITE_SHOW_RNS` (`ProfileTabs/index.tsx`); legacy `/rns?t=` values redirect (`RNSPanel.tsx`, `rns/route.ts` `legacyRnsPath`). This PR adds the `?tab=names` alias. The tab id stays `rns` (100 I07) |
| I02 | Done in 12b | Marketing landing, pills, feature cards, ping button and CTA band deleted (`pages/rns/HomePage` and `components/rns/home/*` removed)                                                                                                   |
| I03 | Done        | RNSHeader deleted, Layout case reduced to the redirect. Back lens in `AddressView.tsx` and `NamePage.tsx`                                                                                                                              |
| I04 | Done in 12b | `FindRnsName.tsx`: labeled G2 well, suffix unit from chain config, helper verbatim, 500 ms debounce, Enter runs the action, pasted suffixes stripped by `parseRnsInput`                                                                |
| I05 | Done in 12b | `FindRnsName.tsx` and `hooks.ts` `useRnsAvailability`: Available only on true, Registered only on false, a failed read shows the error with Retry; a wallet on a chain without a registrar reads from Libertas or shows Switch network |
| I06 | Done in 12b | `FindRnsName.tsx`: result row with the status text in success or ink-2, Register 55 or View as real buttons                                                                                                                            |
| I07 | Done in 12b | `FindRnsName.tsx`: one inline error with the fix in words (`RNS_LABEL_FIX`), after the debounce, never on an empty field, `aria-describedby`                                                                                           |
| I08 | Done in 12b | `FindRnsName.tsx`: address row with 6 plus 4, the primary name or No primary name, and Open to the address view in every case                                                                                                          |
| I09 | Done in 12b | `FindRnsName.tsx`: skeleton row after 400 ms (`useDelayed`), static under reduced motion                                                                                                                                               |
| I10 | Done in 12b | `FindRnsName.tsx` `WrongNetworkNotice` with Switch network (wagmi `switchChain`)                                                                                                                                                       |
| I11 | Done        | `AboutRns.tsx` (D1)                                                                                                                                                                                                                    |
| I12 | Done in 12b | `FindRnsName.tsx`: eyebrow and one intro line, no hero or gradient text                                                                                                                                                                |
| I13 | Done in 12b | `FindRnsName.tsx` (13 padding at 390, Register full width at 390); `MyWalletPanel.tsx` keeps 89 plus the safe area above the dock                                                                                                      |

### 079

| Id  | Status                       | Where                                                                                                                                                     |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I01 | Partly, by later decision    | URL views in `useRnsRoute.ts`. The detail keeps Profile, Identity, Attributes and Facets tabs (105 D1, Rob 3 Oct), so the stacked sections are not built  |
| I02 | Done in 12b                  | `MyRnsNames.tsx`, `shared.tsx` `NameRow`: G0 rows 46, tile, suffix in ink-2, expiry meta, badges, chevron, real buttons                                   |
| I03 | Done in 12a and 12b          | Registration expiry everywhere (`rnsExpiryFromGraceEnd`), grace badge in My names                                                                         |
| I04 | Done in 12b                  | `MyRnsNames.tsx`: Expiry and Name chips, Expiry default                                                                                                   |
| I05 | Done in 12b                  | `MyRnsNames.tsx` one line notice                                                                                                                          |
| I06 | Done in 12b                  | `MyRnsNames.tsx`: no wallet, empty, loading after 400 ms, failed with Retry                                                                               |
| I07 | Done in 12b                  | `MyRnsNames.tsx` eyebrow and count                                                                                                                        |
| I08 | Done                         | Header card in `NameHeader.tsx` (12c); Find your own RNS name added here                                                                                  |
| I09 | Done in 12c by 102           | Profile records and Publish changes with a Review and the fee (`ProfileTab.tsx`, `PublishFlow.tsx`). Edit profile opens Page (102 I12), not inline fields |
| I10 | Done in 12c                  | `BannerDialog.tsx` in the shared Dialog, 44 controls, Done last                                                                                           |
| I11 | Done in 12c by 102           | Owner, resolver and parent in Name details; Extend and Transfer for the owner; dead pseudo buttons gone                                                   |
| I12 | Done                         | Not available for unreadable dates (`ProfileTab.tsx`)                                                                                                     |
| I13 | Done                         | Hex token ID added; resolver and View on explorer already in Name details                                                                                 |
| I14 | Done in 12c                  | `NamePage.tsx` skeleton after 400 ms, failed card with Retry, free name redirects to register                                                             |
| I15 | Done in 12c                  | `useRnsRoute.ts` `parseRnsInput`; `NamePage.tsx` Not a valid RNS name card                                                                                |
| I16 | Done                         | Every copy button 44 with an aria-label and Copied                                                                                                        |
| I17 | Done in 12b and 12c          | 390 layouts; name and suffix are two spans                                                                                                                |
| I18 | Done in 12b                  | `AddressView.tsx` active names as G0 rows with Primary. Order is Primary first, then soonest expiry (111)                                                 |
| I19 | Done in 12b                  | `AddressView.tsx` search at 6 or more (D1), no match variant with Clear search                                                                            |
| I20 | Done                         | Loading, failed and empty in 12b; the entered value on the invalid card added here                                                                        |
| I21 | Done                         | `AddressView.tsx` header                                                                                                                                  |
| I22 | Done in 12f by 103, 104      | Identity tab when Authbase is configured, one status badge, no raw error                                                                                  |
| I23 | Done                         | D2 rule above                                                                                                                                             |
| I24 | Not built, by later decision | 102 I03: the header never shows an Authbase attribute. The Verified button in `NameHeader.tsx` opens Identity                                             |
| I25 | Done in 12b                  | Primary from the forward checked reverse record (`rns.addressSummary`, `useReverseLookup`)                                                                |

## Notes

- Vocabulary. 100 I09 set RNS name, RNS names and the RNS tab after 077 and 079 were evaluated. Labels such as Search RNS names, Back lens RNS, Could not check and Open keep the later wording. Only the approved 077 D1 text uses "name".
- About names drops What does Verified mean? The Verified disclaimer still shows with every Verified chip.
- 079 D2 and the Privacy Policy. The published policy says "Only you can see those shared attributes." Showing them to visitors needs that line changed and `CONSENT_POLICY_VERSION` bumped first (`docs/legal/privacy-parameters.md`). So the visitor half of D2 ships off behind `RNS_PUBLIC_ATTRIBUTES`. The Verified only rule, the eyebrow and the owner lines are live now.
- 079 D2 counsel questions stay open: whether the Authbase consent covers display to any visitor, and which keys may show. The server allows `name` and `country` only, the same keys the client labels.
- Address view meta reads Active until and Primary sorts first (111). 079 I18 asks for Expires and soonest expiry first. Not changed.
- The `?tab=names` alias rides the same effect pattern as the legacy `transactions` and `transfers` tab values.

## Waits

- Counsel: the three About names answers before `VITE_SHOW_RNS` is turned on in production (077 D1).
- Counsel and Rob: the Privacy Policy line on shared attributes before `RNS_PUBLIC_ATTRIBUTES` is turned on (079 D2).

## How to test on staging

1. With `VITE_SHOW_RNS=true`, open https://app.staging.amped.bio/wallet?tab=rns. ABOUT NAMES shows three rows. The first is open. Opening another closes it. The cost answer ends with the testnet line.
2. Open https://app.staging.amped.bio/wallet?tab=names: it lands on the RNS tab. Open https://app.staging.amped.bio/rns?t=my-names: the same. No RNS strip shows above the content.
3. Search an address that has a primary name and open it: the header shows the name with Copy name, the address 6 plus 4 with Copy address, and View name. Each copy raises Copied.
4. Open `/wallet?tab=rns&address=<an address with no names>`: the address at 26/33, No primary name, and No active RNS names.
5. Open `/wallet?tab=rns&address=0x123`: This is not a wallet address with 0x123 under it.
6. Open a name you do not own: Find your own RNS name returns to the search. Open Name details: Registered, Expires, Grace period ends, Token ID and Token ID (hex).
7. On a Verified owner's name, as the owner, open Identity: SHARED BY THE OWNER with the Privacy Policy line. As a visitor: the status card only, while `RNS_PUBLIC_ATTRIBUTES` is off on https://api.staging.amped.bio.
8. Optional, after the policy update: set `RNS_PUBLIC_ATTRIBUTES=true` on the staging API. A visitor sees the Name and Country rows and the line "The owner shared these through Authbase. Anyone who views this name can see them." A Not verified wallet shows no rows.

Screenshots are not included.
