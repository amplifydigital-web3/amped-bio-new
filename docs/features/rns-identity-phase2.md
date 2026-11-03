# RNS as on-chain identity: phase 2 (two way binding)

Status: spec for approval, 27 Oct 2026. QA fixes 3 Nov 2026 (rows 346 to 348; project doc claude/amped-screen-full-qa-seller-2026-11-03.md). Build Board: D25 "RNS as on-chain identity on the profile" (Step 1, priority 12).
Owner: Rob Frasca. Drafted by Claude.
Baseline: `development` at a3ce333.
Design: RNS two way binding, https://claude.ai/artifact/DNtf2TeM2UquQQeiG5MK4Q (boards B1 to B3 with their states and the 1440 frames, redrawn 3 Nov)
Earlier work: RNS ID block #33 (`docs/features/rns-id-block.md`), PRs #265, #341, #342. Project docs: analysis (30 Sep) and staging review (10 Oct).

## 1. Where phase 1 left it

Phases 0 and 1 are on staging. The read model (`services/rnsIdentity.ts` `computeRnsIdentity`), the binding rule (`services/rns.ts` `checkRnsBinding`), the public chip and Verified badge, the Identity sheet, the Wallet Names tab with Register, Extend, Transfer and Publish (`components/panels/wallet/rns`), and the RNS ID block all ship. The copied RNS dapp is gone (`components/panels/rns/RNSPanel.tsx` is now a redirect).

What is left from the 30 Sep plan:

| Gap | Today |
| --- | --- |
| Binding is one way | `checkRnsBinding` proves the wallet owns the name and the name resolves to the wallet. Nothing on chain says which Amped page the name belongs to. Any app reading the name cannot find or trust the page |
| Reverse record | Not set. `addr.reverse` for the wallet does not name the RNS name, so wallets and explorers show the raw address |
| Badge rule | Verified chip = Authbase VERIFIED + one way binding. Decision `badge-rule` on the card is open |
| Shared RNS code | Server (`services/rns.ts`, `rnsTrust.ts`, `rnsSummary.ts`) and client (`utils/rns`, `services/subgraph/*`, `hooks/rns/*`) each carry their own subgraph queries and readers, about 900 lines in parallel |
| Agents (phase 3), facets and proofs (phase 4) | Not started. Out of scope here; separate specs |

## 2. Two way binding

A name is **two way bound** to an Amped page when all four hold:

1. The name is active (`isRnsNameActive`, grace does not count).
2. The name's owner is the page wallet.
3. The resolver `addr` of the name is the page wallet.
4. The name's `url` text record is the page URL, `https://amped.bio/{handle}`.

Checks 1 to 3 are today's `checkRnsBinding`. Check 4 is new. The `url` key already exists in `RNS_RECORD_KEYS` (`useRnsName.ts`) and Publish writes it from the Amped profile, so no new record key is needed (decision B1).

`checkRnsBinding` gains a `url` read in the same multicall and returns `{ ok: true, twoWay: boolean }`. A handle change makes `twoWay` false until the creator publishes again; the editor shows that state (design board B3).

## 3. Reverse record

Publish adds one optional row, "Show this name for my wallet", which calls `REVERSE_REGISTRAR.setName(name)`. Default on for the first publish (decision B2). Reading: `rnsSummary` already resolves names for addresses; it prefers the reverse name when it is set and bound.

Transactions (QA 3 Nov, RN-Q1). Publish today is one resolver call (`setText` or `multicallWithNodeCheck`, `apps/client/src/components/panels/wallet/rns/name/PublishFlow.tsx:93-112`). `setName` lives on `REVERSE_REGISTRAR`, a different contract (`apps/server/src/services/rnsSummary.ts:78-82`). With the reverse row on, Publish is **two transactions**: the wallet confirms twice and pays two fees. The Review step says "Two transactions" and shows the summed fee estimate. Where the wallet supports `wallet_sendCalls` (EIP-5792), RN2 sends both calls as one batch and the Review step says "One confirmation in your wallet". With the reverse row off, it stays one transaction.

The reverse row is Set primary (QA 3 Nov, RN-Q3). The wallet's Primary chip comes from the reverse lookup (`apps/client/src/components/panels/wallet/rns/MyRnsNames.tsx:40`). Card #45 left Set primary open because it needs a reverse registrar transaction and its own review step (`home-get-trevo-rns-cards.md`, section 2). Decision for Rob on #45 and #25, recorded in section 7 as RN-Q3. If B2 stands, Set primary on a wallet name card opens this Publish flow with only the reverse row checked, and #45 needs no separate flow.

### 3.1 Point to this wallet (QA 3 Nov, from identity checks VS-Q4)

RN2 also adds a name page flow `flow=point` for a name the wallet owns whose resolver `addr` is another address. It calls the resolver `setAddr(node, wallet)`. Steps and parts as Publish: Profile is skipped, Review (Network fee (estimate), Balance after, ComplianceCard), Confirm in wallet, result. The Get paid card (identity checks 5.2) links to it for `not_bound`.

Chain note: `REVERSE_REGISTRAR` is set on Libertas testnet and is the zero address on the Revolution devnet config (`packages/web3/src/index.ts` line 46). There is no mainnet chain config yet (`AVAILABLE_CHAINS` is Libertas testnet and Revolution devnet). The row is hidden when the address is zero.

## 4. Verified badge rule (decision `badge-rule`)

Recommended (the card's recommended answer): the Verified badge needs two way binding **and** a current Authbase VERIFIED on the same wallet.

Change in `computeRnsIdentity`:

| Authbase | Binding | Chip today | Chip after |
| --- | --- | --- | --- |
| VERIFIED | two way | verified | verified |
| VERIFIED | one way | verified | **name**, with the owner nudge "Publish to your name to show Verified" |
| not verified | any | name | name |
| any | none | none | none |

Existing Verified pages lose the badge until the owner publishes once. Before the switch, a one time email and an editor notice ask owners with a one way binding to publish (about two minutes, one transaction). The switch is behind `RNS_BADGE_TWO_WAY` so it turns on after the notice period (decision B3).

The seller check in `docs/features/identity-checks.md` (revision 4, S1) uses `checkRnsBinding(...).ok`, the one way rule, so selling is not blocked by a missing `url` record. Whether sellers should need two way binding once the flag is on is held for Rob (identity checks section 9, X-Q1).

## 5. One RNS module

Move the shared parts into `packages/web3/src/rns/`:

| Moves | From |
| --- | --- |
| Subgraph client and queries (names by owner, registration, expiry) | `apps/client/src/services/subgraph/*`, server copies in `rnsIdentity.ts`, `rnsSummary.ts` |
| On chain fallback reads | `apps/client/src/services/subgraph/onchainFallback.ts` |
| `readRnsName` (expiry, owner, addr, url) multicall | `apps/server/src/services/rns.ts` |
| Label rules, suffix, formatting | already in `packages/web3/src/rns.ts` |

The client hooks and the server services import from `@repo/web3/rns`. Behavior does not change; the existing tests in `apps/server/src/__tests__/rns-identity.test.ts` and the client RNS tests move with the code. This is pure refactor and ships as its own PR.

## 6. UI

Design boards cover:

- B1 Publish. The shipped Publish flow stays: step bar (Profile, Review, Confirm in wallet), Network fee (estimate), Balance after and the ComplianceCard with `TESTNET_NOTICE` (`PublishFlow.tsx:9,17,214-221`). RN2 adds two things to the Profile step only (RN-Q2):
  - The `url` row: "Page link", "amped.bio/{handle}. Links this name to your Amped.Bio page." Unchecked, it shows "Your name will not link to your page."
  - The reverse row: "Show this name for my wallet", "Wallets and explorers show {full name} instead of {short address}." Hidden when `REVERSE_REGISTRAR` is the zero address.
  - Each row is one 44 px target (the whole row toggles the checkbox) (RN-Q5).
  - States (RN-Q4): reverse row hidden; Network fee: not available with Retry; declined ("You cancelled in your wallet. Nothing changed."); failed ("Publish did not complete" with Retry); desktop SidePanel 508 wide at 1440. All reuse the shipped cards.
- B2 Identity sheet (owner) with the new "Linked both ways" line, and the nudge when only one way. Both carry the shipped footnote "Verified means the identity check passed. It is not an endorsement." (`packages/ui/src/prism/rns-identity.tsx:77`) (RN-Q6). B2b keeps the "Verified by Authbase" row, so the owner sees that only the link is missing (RN-Q8). States (RN-Q7): loading; Authbase unavailable (`rnsTrust` returns unavailable: "We could not check Authbase right now. Try again in a minute." with Try again); Authbase not verified with two way binding (name chip, Verify with Authbase); Authbase expired (Verify again); name expired (Extend); notice period before `RNS_BADGE_TWO_WAY` turns on (one way still Verified, with "From {date}, Verified needs your name linked both ways. Publish to your name to keep it."); desktop at 1440.
- B3 Handle changed after publish, in the Page panel, phone and 1440 (RN-Q9). Copy (RN-Q10): "You changed your page link to amped.bio/{new}. Publish to update your name." The line "Your store is not affected." is held with X-Q1: it is true only while sellers use the one way rule.
- B4 Public chip and sheet, unchanged for visitors except the badge rule.

## 7. Decisions for Rob (recommended first)

All decisions in this section are open until Rob answers on the card.

**`badge-rule` (open on the card).** Recommended: two way binding plus Authbase VERIFIED. Why: binding proves control of both sides, Authbase proves the person. Alternative: one way binding plus Authbase (today).

**`bio-source` (open on the card).** Recommended: the Amped profile is canonical; Publish writes RNS records in one explicit transaction. Why: no transaction per edit; autosave stays intact. This is how Publish works today, so the choice records current behavior.

**`registration-home` (open on the card).** Recommended: the Wallet Names tab, with deep links to the RNS app for advanced records. Already built; the choice records current behavior.

**B1. Which record links the name to the page.** Recommended: the existing `url` record. Why: already written by Publish and read by RNS apps. Alternative: a dedicated `amped.handle` record. Unambiguous, but no other app reads it.

**B2. Reverse record on first publish.** Recommended: on by default, can be turned off. Why: wallets show the name instead of the address. Alternative: off by default.

**B3. Existing Verified pages.** Recommended: 14 days of notice, then the two way rule turns on. Why: no surprise loss of the badge. Alternative: turn it on at once.

**RN-Q3. Reverse row and Set primary (open, #25 and #45).** Recommended: one flow. The reverse row in Publish is the Set primary action; Set primary on a wallet name card opens Publish with only that row checked. Alternative: a separate Set primary flow on #45 with its own review step.

`agent-model` and `public-attributes` stay open for the phase 3 and phase 4 specs.

## 8. Build

| PR | Scope | Size |
| --- | --- | --- |
| RN1 | `packages/web3/src/rns` module, imports moved, no behavior change | 1.5 days |
| RN2 | `url` read in the binding, `twoWay`, Publish rows (url label, reverse) inside the shipped Profile step, two transactions or one `wallet_sendCalls` batch (3), `flow=point` (3.1), Identity sheet states and footnote (6), handle change state | 2 days |
| RN3 | `RNS_BADGE_TWO_WAY` flag, badge rule, notice email and editor notice | 0.5 day |

## 9. Acceptance

1. A name whose `url` record is `https://amped.bio/{handle}` and that passes the one way checks reads `twoWay: true`.
2. Changing the handle makes `twoWay` false and shows the publish prompt; publishing restores it.
3. With the flag on, a VERIFIED owner with a one way binding shows the name chip, not Verified, and sees the nudge.
4. Publishing with the reverse row on makes the wallet's reverse lookup return the name.
5. The seller check passes on a one way binding.
6. After RN1 the client and server contain no RNS subgraph query outside `packages/web3/src/rns`.
7. Typecheck, build and tests pass. Copy has no em or en dashes.
8. With the reverse row on and no `wallet_sendCalls` support, Review says "Two transactions" and the fee is the sum of both estimates. (RN-Q1)
9. Publish keeps the step bar, Balance after and the ComplianceCard with `TESTNET_NOTICE`. (RN-Q2)
10. On a chain whose `REVERSE_REGISTRAR` is the zero address, the reverse row does not render. (RN-Q4)
11. Every Identity sheet state that shows Verified carries the not an endorsement footnote. (RN-Q6)
12. `flow=point` sets the resolver `addr` of an owned name to the wallet, and the seller check then passes the binding. (3.1)

## 10. Open questions

| Question | Owner | Blocking |
| --- | --- | --- |
| Mainnet RNS and reverse registrar addresses and date | Revolution team | Mainnet |
| 079 D2: Privacy Policy update before `RNS_PUBLIC_ATTRIBUTES` turns on (carried from phase 1) | Counsel | Attributes only |
