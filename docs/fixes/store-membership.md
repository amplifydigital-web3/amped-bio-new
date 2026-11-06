# MB-2: Store membership (plan editor, join sheet, storefront card, Also in membership)

Branch `feat/store-membership` into `development`. PR plan MB-2 (wave 5), Build Board #20 (Content and store) and #25 (Memberships). Specs:

- memberships spec decisions 6 and 7 (one plan per creator; amount bounds);
- amendment 1 section 3.1 (2 Nov, project doc `claude/amped-memberships-payments-amendment-2026-11-02.md`);
- `docs/features/mobile-checkout.md` section 11 (the join sheet, board c2);
- `docs/features/store-policy.md` 5.2, the MB-2 row (section 5 renders only for a store with a plan);
- `docs/features/store-catalog.md` 6 (storefront sections, board s2 and s3).

Screen Review row 160 (Store tab, Membership, board st4). Drafted by Claude for Rob Frasca, reviewer Gustavo, 2026-11-04.

**Merge order.** This branch is stacked on MB-1 (#475). That carries C10 (#472), C9 (#452), PAY-2 (#449) and PAY-3 (#450). Merge #449, #452, #472, #450 and #475 first.

**No migration.** `offers.also_in_membership` shipped in C9 and `membership_plans` in MB-1. Label `enhancement` only.

**No new env values or flags.** Join waits on the existing `checkout` site flag, as MB-1 does.

## 1. What ships

| Area               | Files                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan editor        | `content/store/MembershipTab.tsx`, the Membership tab in `StoreTab.tsx`. Name, description, up to 6 benefits, the amount every 30 days, an optional yearly amount with "Members save N% a year", "You receive $N USDC per renewal after the Amped.Bio fee of 5%", Show member count, Save, Start taking members, Pause new members. A saved plan shows "New amounts apply to new members only." |
| Also in membership | The product editor in `StoreTab.tsx` shows a Switch "Also in {plan}" once the creator has a plan. `store/products.ts` saves it and refuses it without a plan (`no_plan`). `cardOf` returns it                                                                                                                                                                                                   |
| Policy section 5   | `packages/constants/src/store.ts`: `MEMBERSHIPS_SECTION` is section 5 of Part B, verbatim. `renderStandardPolicy` leaves it out when `memberships` is false. `store/policy.ts`: `hasPlan`, `versionCoversMemberships`; publish renders section 5 when the creator has a plan in any status and stores `settings.memberships`                                                                    |
| Activation gate    | `memberships/plans.ts`: a plan goes active only when the live policy covers memberships, else `PlanError("policy")`. The router reads "Publish your store policy again so it includes Memberships."                                                                                                                                                                                             |
| Go live checklist  | `store/settings.ts`: the "something to sell" step counts active offers plus an active plan                                                                                                                                                                                                                                                                                                      |
| Public plan        | `publicPlan` adds `sellerName` and `policyVersion` from the live policy, so the join sheet names the seller the way the policy does. A paused plan is not public                                                                                                                                                                                                                                |
| Storefront         | `landingpage/.../StoreViews.tsx`: `MembershipCard` in the `membership` section slot (first when an older section order lacks it). "$5 USDC every 30 days", "or $48 USDC a year, save 20%", the member count from 10, Join to the app. No Join in owner preview                                                                                                                                  |
| Product page       | "Also included in {plan}." with "Join instead", when the product is also in the membership                                                                                                                                                                                                                                                                                                      |
| Join sheet         | `apps/client/src/pages/Join.tsx` at `/join/:handle`, lazy, behind `ProtectedRoute` and the in app browser handoff (`JoinHandoffGate`)                                                                                                                                                                                                                                                           |
| Copy               | `MEMBERSHIP_COPY.join` and `MEMBERSHIP_COPY.card` in `packages/constants/src/memberships.ts`                                                                                                                                                                                                                                                                                                    |

## 2. The join sheet

One screen, mobile checkout 11:

1. Every 30 days and Yearly chips. Yearly shows only when the plan has a yearly amount, with the saving.
2. The amount, then "{amount} today, then {amount} every 30 days from your wallet. Cancel any time." and "Includes the Amped.Bio fee of 5%".
3. The counsel seller line `CHECKOUT_COPY.soldBy(seller)` and a Store policy link to the live version.
4. One checkbox, unticked: "I agree to renewals every 30 days and to {seller}'s store policy." Join is disabled until it is ticked.
5. Join calls `memberships.join.prepare` with the live wallet as `signer`. The fan signs the join table, then the USDC permit, with `usePaymentChainSigner` (the server names the account; a mismatch stops before signing). Then `join.submit`, then `join.status` every 3 seconds, ten times, while the join lands.
6. After prepare, a Details row states the permit allowance.

States:

- Short wallet: "Your wallet needs $N USDC more." with Add USDC to Wallet, `need` prefilled and a return to the join sheet. Nothing is signed.
- Lapsed seller, or no active plan: "Not taking new members right now". No Join.
- A current member (active, in grace, or canceled with access left): "You are a member" and Open in your Library.
- Wallet cancel: "You cancelled in your wallet. Nothing was taken."
- Done: "You are a member." and Open in your Library.

## 3. Choices made in the build

1. **Section 5 and activation.** A policy published before the plan existed has no section 5. Section 5 renders once a plan exists in any status. Activation then needs the live policy to include it. The creator saves the plan, publishes the policy again, then starts taking members.
2. **The join sheet is its own page, not the pay sheet.** The pay sheet (CK-2) quotes one time purchases through a checkout intent. A membership needs two signatures and an allowance, so it reuses the pay sheet's room, seller line and handoff, not its intent.
3. **Join lives in the app.** The storefront card and the product page link to `{panel}/join/@handle`. The fan signs in there, as with Buy.
4. **Access through the membership is G5.** "Also in membership" is saved and shown. Opening those items as a member waits on the engine's `member` kind (G5, with `isMember` from MB-1), as one time `paid` access waits on G4.

## 4. Flags for Rob

1. **Counsel template wording.** Section 5 of the counsel store policy says "Memberships are monthly or yearly". The product rule is "every 30 days". The template is verbatim counsel text, so the build does not change it. Counsel should confirm "every 30 days or yearly".
2. **AmpedMemberships decisions M1 to M5** stay open on #51. MB-1 and MB-2 follow the recommendations.
3. **Deferred:** a membership bio block type; `any(member, paid)` rule writing (G4 and G5); Follow on join (memberships decision 14); the join sheet in the creator's theme.

## 5. Checks run

- Typecheck: server, client and landing pass. Builds: `build:packages`, server, client and landing pass.
- Tests:
  - Server: 1,353 passed outside the OAuth suites, including 1 new in `memberships-core.test.ts` (seller name and version on the public plan; a paused plan is hidden).
  - Client: 282 passed, including 7 new in `Join.test.tsx` and 2 new in `MembershipTab.test.tsx`.
  - Landing: 71 passed, including 3 new for the membership card and the product line.
  - `@repo/constants`: 222 passed, including the section 5 test.
- `pnpm check:copy`: 193 store strings pass.
- `oxlint` on the new files: no errors.

## 6. Staging check for Gustavo

1. Merge order as above. Deploy AmpedMemberships and set `AMPEDMEMBERSHIPS_ADDRESS` (MB-1 handoff). Turn on `checkout`.
2. As a verified seller with a published store policy, open Store, Membership. Create a plan: $5 USDC every 30 days, $48 USDC a year. The tab shows "Members save 20% a year." and "You receive $4.75 USDC per renewal".
3. Press Start taking members. It refuses with "Publish your store policy again so it includes Memberships." Publish the policy again. Section 5, Memberships, is now in it. Start taking members works.
4. Edit a product, turn on Also in {plan}, save. The product page reads "Also included in {plan}." with Join instead.
5. Open the storefront. The membership card shows the amounts and Join.
6. As a fan with test USDC, press Join. The join sheet opens in the app. Join is disabled until the box is ticked. Join, sign twice, and the sheet reads "You are a member." People, Members lists the fan.
7. As a fan with under $5 USDC, Join reads "Your wallet needs $N USDC more." and Add USDC opens Wallet prefilled.
8. Pause new members. The storefront card is gone and `/join/@handle` reads "Not taking new members right now".
