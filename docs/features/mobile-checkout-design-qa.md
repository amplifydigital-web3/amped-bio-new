# Mobile checkout: design QA

Build Board #49. Companion to `docs/features/mobile-checkout.md`.

- **Full QA:** 29 Oct 2026, boards c1 to c5 against `development` at 9ed4a4e. Checked against AmpedPay (PR #373), identity checks revision 2 (PR #369), adult content (#28) and the shipped Buy USDC code (`packages/constants/src/usdc.ts`). Result: not ready for build. 4 P0, 8 P1 and 6 P2 findings.
- **Redraw:** 29 Oct 2026, version 3 of the Mobile checkout design page: 8 boards, 24 screens. https://claude.ai/artifact/NYc9fA5HP3EB35sG4EYdoP
- **Result after the redraw:** every finding is fixed in the boards, moved into the spec, or resolved by a decision. All 8 boards pass the Prism 2.2 gate (contrast, 44 targets, words, no dashes, overflow).

## Findings and resolution

| # | Sev | Finding | Resolution | Where |
| --- | --- | --- | --- | --- |
| 1 | P0 | No Over 18 check before Pay | New board c6: the Adult items card, the Over 18 check, then the pay sheet with the 18+ tag. The second half of the finding (hide Buy USDC on 18+) was withdrawn: the on-ramp only loads the wallet (Rob, 8 and 29 Oct) | Spec 6; c6 |
| 2 | P0 | Open in Safari cannot leave Instagram on iPhone | Decision QA1: menu steps per app plus Copy link. Android keeps Open in Chrome | Spec 7; c4 |
| 3 | P0 | Copy link carried the sign in token | Token rule: copied link carries the intent only; the token rides the direct handoff only, 2 minutes, single use, bound to the intent, checkout scoped session | Spec 7; c4 |
| 4 | P0 | c3 dropped counsel's Buy USDC copy | Resolved by the shortfall rule: the handoff opens the shipped Wallet panel with `ONRAMP_COPY` verbatim | Spec 8; c3 |
| 5 | P1 | Sign in with Apple drawn, not configured | Decision QA2: Google and email only | Spec 7; c4 |
| 6 | P1 | Quotes expire in 10 minutes | Fresh quote on every open; Price changed state with Was and Now | Spec 5, 10; c7 |
| 7 | P1 | Coinbase's minimum beats small shortfalls | Decision QA4: prefill the larger, with the reason line | Spec 8; c3 |
| 8 | P1 | Apple Pay and Google Pay drawn as everyone's default | Resolved by the shortfall rule: the Wallet panel picks the path by region | Spec 8 |
| 9 | P1 | Staging cannot finish the c3 path; no test USDC line | Sandbox Arrived never enables Pay; Circle's faucet for test fans; the staging line on /pay | Spec 5, 8 |
| 10 | P1 | Membership consent drawn pre checked; "a month" | Unticked, Join disabled until ticked; "every 30 days"; allowance renewal line | Spec 11; c2 |
| 11 | P1 | Sessionless return page named the item | `/r/{intent}` names no item, creator or amount | Spec 9; c5 |
| 12 | P1 | Error states not drawn | New boards c7 and c8 with one pattern | Spec 10; c7, c8 |
| 13 | P2 | Amounts without the USDC tag | Every amount carries USDC | Spec 5, 11; c2, c5 |
| 14 | P2 | "Paying" and "Buying from" both used | "Paying @handle" everywhere | Spec 5 |
| 15 | P2 | "17 members items" | "17 member items" | c2 |
| 16 | P2 | Fee row fixed as "5%, included" | The fee row comes from the quote | Spec 5; c1 |
| 17 | P2 | c3 presets | Resolved: the shipped presets ($10, $25, $50, $100) with the shortfall prefilled | c3 |
| 18 | P2 | Verified chip meaning | The identity checks seller rule, the page header component | Spec 5 |

## What passed in the first review and still stands

- One screen pay with the fee and network fee in plain rows. The short balance names the exact gap.
- Buy USDC keeps Coinbase as the named seller and stays Amped.Bio branded (payment flow rule 1).
- Checking and "can only go through once" match AmpedPay's nonce binding.
- Renewal terms: 3 day reminder and 7 day grace match D7.
- "Payments are final. Refunds are at the creator's discretion." matches AmpedPay refunds inside `refund_window_days`.

## Still to test in code

- Every app on real devices before CK-4 merges (spec 13).
- The handoff token security review before CK-4 merges.
- The Prism 2.2 gate on the built screens of each PR against boards c1 to c8.
