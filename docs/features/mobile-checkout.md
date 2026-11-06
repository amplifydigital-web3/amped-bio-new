# Mobile checkout

Status: revision 3.2, 4 Nov 2026. CK-2, CK-3 and CK-4 are on `development`; CK-5 is open (`feat/checkout-live`, handoff `docs/fixes/checkout-live.md`). This is CK-0: it records the 23 Oct mobile first review as amended by the 29 Oct Full QA and Rob's answers, and it carries the spec edits the PR plan lists for the content, USDC and memberships specs (section 16).
Owner: Rob Frasca. Drafted by Claude.
Build Board: #49 Mobile checkout. Related cards: #18 Paid content, #25 Memberships, #50 AmpedPay, #28 Adult content, #5 On-ramp.
Baseline: `development` at 0500800 (2 Nov 2026), which contains CK-1 (#399, merged 2 Nov).
Design: Mobile checkout boards c1 to c8, version 3 (29 Oct), https://claude.ai/artifact/NYc9fA5HP3EB35sG4EYdoP. All 8 boards pass the Prism 2.2 gate.
Supersedes: content system 3.8 (Buy and Join entry, `?next=`, amount display) and 3.9 (the sheets, the checkbox, the short balance, the quote and the unlock point); USDC wallet and on-ramp 3.7 (the Add USDC entry from checkout, Arrived, the Coinbase redirect, in app browsers) and decision 8 (display on creator money surfaces). Section 16 lists each change. Where those specs disagree with this one, this document wins.
Sources: mobile first review (23 Oct), https://claude.ai/artifact/S3BmsNDbin12jbZP7Nc6Fe; PR plan (24 Oct), https://claude.ai/artifact/DNkEKTAkUFNZJyrmxWcDMG; Full QA (29 Oct), `docs/features/mobile-checkout-design-qa.md`.

## 1. Problem

A new fan on an iPhone who taps Buy on a creator page inside Instagram needs about 22 actions, 4 context switches and two waits before the item opens. Four things break the purchase outright:

1. The pay sheet was drawn over `amped.bio/{handle}`. That app has no embedded wallet. Only `apps/client` runs Web3Auth, and its session is stored per origin.
2. In app browsers break sign in and payment. Google blocks OAuth in embedded webviews, and Coinbase's Apple Pay frame needs Safari or Chrome.
3. Nothing carried the purchase across sign up, the Coinbase trip, a browser switch or a reload. CK-1 fixed this with the checkout intent.
4. The Coinbase account path returned to `/wallet`. A fan using the home screen web app on iOS has a separate storage jar there and lands signed out.

The target is about 10 actions and 1 switch for a new fan, 4 of them Coinbase's one time verification, and 2 taps for a fan with a balance.

## 2. Decisions

All answered by Rob. Recorded on card #49.

| # | Decision | Answer | Date |
| --- | --- | --- | --- |
| D2 | Where checkout runs | `app.amped.bio/pay/{intent}` in `apps/client`, full screen on phones, styled as the creator's sheet | 24 Oct |
| D3 | In app browsers | Free actions stay in the webview. Buy and Join hand off to Safari or Chrome | 24 Oct |
| D4 | When access opens | On the first confirmation, revoked on the rare reorg | 24 Oct |
| D5 | Checkbox on one time purchases | No. "Payments are final" sits above the button. Keep the checkbox on memberships | 24 Oct |
| D6 | How amounts read to fans | `$3 USDC` on creator money surfaces, USDC only in Wallet, a one line explainer on the first money sheet | 24 Oct |
| D7 | Membership grace | 7 days with access, readiness check 3 days before a charge | 24 Oct |
| D8 | What ships first | One time purchases and the store. Memberships follow AmpedMemberships | 24 Oct |
| Shortfall | Short balance | Checkout hands off to the Wallet's standard Buy USDC flow, prefilled with the shortfall. USDC always lands in the fan's own wallet. The resume bar brings the fan back to Pay. Same rule for every item, 18+ included. No Coinbase approval track | 29 Oct |
| QA1 | Leaving Instagram on iPhone | Lead with the menu steps drawn for the app the fan is in (Instagram, TikTok, X, Facebook), with Copy link as the button. Android keeps one tap to Chrome | 29 Oct |
| QA2 | Sign in after the handoff | Continue with Google and Use email. No Sign in with Apple in v1 | 29 Oct |
| QA4 | Shortfall below Coinbase's minimum | Prefill the larger of the shortfall and Coinbase's minimum, with one line saying why | 29 Oct |

Superseded:

- **D1 (24 Oct), Add USDC as a sheet stacked on the creator sheet.** Replaced by the shortfall rule. CK-3 becomes the Wallet handoff and drops from 2.5 to 1.5 days.
- **QA3 (29 Oct).** Answered by the shortfall rule.
- **Full QA P0 1, second half.** It said 18+ checkouts must hide Buy USDC. That read an old copy of #28. Rob decided on 8 Oct that the on-ramp only loads the wallet, and confirmed on 29 Oct. The Over 18 check before Pay (section 6) stands.

## 3. What exists (CK-1, merged 2 Nov)

- `CheckoutIntent` table (migration `20261030180000_checkout_intents`), UUID v7 ids.
- `packages/constants/src/checkout.ts`: kinds `purchase`, `membership`, `tip`, `ticket`; only `purchase` is live (`LIVE_CHECKOUT_KINDS`). Statuses `open`, `awaiting_funds`, `signing`, `submitted`, `paid`, `expired`. Resumable statuses `open` and `awaiting_funds`. Life 24 hours (`CHECKOUT_INTENT_TTL_MS`). Query parameter `ci` (`CHECKOUT_INTENT_PARAM`). Sources `bio`, `item_page`, `store`, `library`, `telegram`, `email`, `push`, `other`. Build step (next CK PR): rename the source `telegram` to `messages` in `CHECKOUT_SOURCES` (`packages/constants/src/checkout.ts`), because Amped Messages replaced Telegram (Rob, 2 Nov). `checkoutPayPath(id)` returns `/pay/{id}`.
- `checkout.start` (public, 20 a minute per user or IP), `checkout.get` (public; the first signed in reader claims an unclaimed intent; a creator cannot claim an intent on their own page; an item removed since start reads as expired), `checkout.resumable` (private, the resume bar).
- `?via=` is copied into the intent at start. The `ci` parameter rides sign up and sign in in the landing app.
- The resume bar (`CheckoutResumeBar`) in `apps/client`: "Finish buying {item}", shown only to the intent's own signed in fan.
- Flag: the `checkout` feature flag (registry `packages/constants/src/feature-flags.ts`), switched in admin › Feature flags with no rebuild or redeploy. The server reads it with `isFeatureOn("checkout")` (`apps/server/src/services/featureFlags.ts`), the client with `isFeatureOn("checkout")` (`apps/client/src/config/featureFlags.ts`), the landing app with `useFeatureFlag("checkout")`. `CHECKOUT_ENABLED` (server) and `VITE_CHECKOUT` (client) are only the fallback while no admin row is set. Off in production.
- Ended intents are purged 30 days after they end unless they became a purchase (privacy parameters).

## 4. The flow

```
Buy or Join on amped.bio (bio, item page, store)
  checkout.start            -> intent id
  in app browser?           -> handoff card (section 7), then Safari or Chrome
  signed out?               -> sign up or sign in with ?ci=, back to /pay/{intent}
  18+ item?                 -> Over 18 check (section 6), back to /pay/{intent}
app.amped.bio/pay/{intent}  -> fresh quote, then one screen pay (section 5)
  balance short?            -> Wallet Buy USDC, prefilled (section 8); resume bar returns to Pay
  Pay                       -> Checking (section 9) -> item opens on the first confirmation
```

Every later step carries `ci={intent}`: sign up, sign in, the handoff, Wallet Buy USDC, the Coinbase redirect, reminders by email and push. No Telegram surface (Rob, 2 Nov).

## 5. The pay sheet (c1, CK-2)

Route `app.amped.bio/pay/{intent}` in `apps/client`. A full screen sheet on phones with the creator page dimmed behind it. A side sheet over a still of the page on desktop (desktop boards are a C9 gate).

**One screen for a fixed amount.** Top to bottom: creator avatar and "Paying @handle" with the Verified chip, cover and title, the access line, the amount, the fee row, the network fee row ("Paid by Amped.Bio"), the balance after, the seller line (below), then the button "Pay $12 USDC" pinned above the safe area. No Amount step and no Review step. No checkbox (D5). Tips keep two steps because the amount varies.

**The fee row comes from the quote.** The quote returns the fee and its effective date. The row never hard codes "5%" (AmpedPay decision 4: the fee can change with notice).

**Fresh quote on every open.** AmpedPay signs each split for `quote_window_seconds` (600 by default, AmpedPay 3.3). The sheet re quotes silently whenever it opens or returns to the foreground. When the amount or the fee changed since the fan last saw it, the sheet shows the Price changed state (c7) with Was and Now before Pay.

**Amounts (D6).** `$12 USDC` together, never `$12` alone. A `$N USDC` formatter in `@repo/ui` renders the figure large and USDC as a tag. The first money sheet per account carries one line: "USDC is a digital dollar. 1 USDC equals 1 US dollar." Wallet balances keep USDC only (USDC spec decision 8 as amended).

**Legibility inside the creator brand.** The header, cover and button color come from the creator theme through `CreatorThemeScope` (shared with FL-4). The figures, fee row and legal lines use the system font with tabular numbers on a solid surface. When the creator's button color fails 4.5:1 for its label, the button uses the creator accent on a neutral surface. No particles, motion or background image inside the sheet.

**Step up.** The commit button is the confirmation for the embedded wallet. A passkey or Face ID step up is required above 100 USDC and on the first purchase from a new device.

**Header wording.** "Paying @handle" on every money sheet (Full QA P2 14).

**Seller line (COUNSEL-ADULT v1.1, store policy spec 3.4, board sp6).** The creator is the seller of record. The first two sentences are counsel text from `docs/legal/creator-storefront-policy.md` (fixed notice), verbatim: "Sold by {seller} on Amped.bio. Your purchase is from {seller}, not from Amped." `{seller}` is the creator's display name until C9, then the seller name from the store policy. CK-5 adds a Store policy link that opens the live `StorePolicyVersion` in a sheet and returns to Pay. The line replaces the earlier "Payments are final. Refunds are at the creator's discretion." Nothing follows the two counsel sentences (decision CK-D1, Rob 3 Nov). CK-5 adds the Store policy link after them. The built sentence "Refunds are at {seller}'s discretion." is dropped, and "Payments are final." is not restored. The seller line names the creator only, never an agency (AG-D2).

Build steps (Full QA 2):

- `packages/constants/src/checkout.ts` `CHECKOUT_COPY.soldBy`: return the two counsel sentences only (CK-Q1, CK-D1).
- `apps/client/src/pages/Pay.tsx`: render the seller line in the sheet notes on every state where the creator is known: ready, short, price changed, failed and paid. Today it shows only on ready (lines 240 to 276) (CK-Q2).
- `apps/client/src/components/checkout/PaySheet.tsx` `SheetFrame`: the shared Verified chip beside the creator name. `Pay.tsx`: the cover beside the title and a Network fee row reading "Paid by Amped.Bio" (CK-Q7). CK-5 scope.
- Price changed while short (`Pay.tsx` lines 245 to 259): the footer reads "Add USDC in Wallet" after the fan accepts the new price, never "Pay" when Pay cannot run (CK-Q9).
- `PaySheet.tsx`, `HandoffCard.tsx` and `CheckoutReturn.tsx`: Prism tokens in place of the literals `#16152B`, `#4A4766`, `#F4F3FA`, `#E4E2F0`, `bg-white` and `rgba(22,21,43,0.55)` (CK-Q32).

**Verified chip.** The chip beside the creator name means the identity checks seller rule (an active RNS name bound to the wallet, identity checks 5.1). It is the same component as the page header (Full QA P2 18).

**Staging.** Every staging page shows "Test USDC on Base Sepolia. It has no value." (AmpedPay 6.1). Staging uses `PAYMENT_CHAIN=base-sepolia`.

**Mock provider.** CK-2 defines a `PaymentProvider` interface with ready, short, paid and failed results. CK-5 replaces the mock with PAY-2 and changes no screen.

## 6. Over 18 before Pay (c6)

An 18+ item never reaches the pay sheet without an `age_over_18` pass (identity checks 4).

- The creator page shows one "Adult items" card with no title, cover or count before a pass (identity checks 4.4).
- Buy on an 18+ item, or opening `/pay/{intent}` for one without a pass, opens the Over 18 check at `app.amped.bio/age-check?returnTo=/pay/{intent}` with the copy and states of identity checks 4.2.
- After a pass the pay sheet opens with the 18+ tag beside the title.
- **Alabama HB 164 notices (AD-D1, Rob 3 Nov). Interim, pending counsel.** Source: Alabama Act 2024 HB 164 (enrolled), Section 9, effective 1 Oct 2024; an adult website is one with more than 33 1/3 percent of content harmful to minors (Section 2). Counsel answers in writing whether and where it applies. Until then:
  - The three Section 9(a)(1) warnings (`ALABAMA_HEALTH_WARNINGS`) show on the Over 18 sheet and on the 18+ landing (the Adult items card and the 18+ shelf), to every viewer.
  - The Section 9(a)(2) helpline notice (`SAMHSA_HELPLINE_NOTICE`) shows on every 18+ page: the 18+ pay sheet, the 18+ fail closed sheet and the 18+ item page.
  - Section 9(c): Prism body 16 or larger, full contrast, never collapsed or behind a toggle.
  - The text is verbatim statute. Do not edit it. The banned word and dash rules do not apply to it. Both constants live in `packages/constants/src/compliance.ts`. Board c6 and c9.
- **Until A1 ships the check (#423).** `apps/client` has no `/age-check` route. The redirect on `development` (`Pay.tsx` lines 103 to 108) lands on a dead page. #423 fails closed: an 18+ item shows "This item is for over 18s. It cannot be bought here yet." (`CHECKOUT_COPY.over18`) with Back to the page and no Pay. Board c9. #423 must merge before the checkout flag turns on anywhere (CK-Q3).
- An `under_18` result refuses the item as identity checks 4.2 and 4.5 say. The intent ends as expired. Nothing about the item shows again.
- A short balance follows the same Wallet rule as every other item (section 8).

## 7. In app browser handoff (c4, CK-4)

**Detection.** Instagram, Facebook, TikTok, X, LinkedIn, Snapchat and Threads webviews by user agent. Free actions stay in the webview: browse, preview, Follow with email code sign in.

**Android.** One button, "Open in Chrome", an `intent://` link to Chrome, with Copy link below it. As built in CK-4 (#417), the link carries the intent only. The fan signs in again in Chrome.

**iPhone (QA1).** Instagram blocks `x-safari-https://`, and `window.open` gives a blank screen. Universal Links need a native app. So the iPhone card shows two drawn steps for the app the fan is in (the menu, then Open in browser), with Copy link as the only button. No button that cannot work.

**No sign in token in v1 (CK-D2, Rob 3 Nov).** CK-4 merged on 3 Nov without the token (`packages/constants/src/inAppBrowser.ts` lines 44 to 48) and v1 ships that way. The fan signs in again in Chrome or Safari. The card says "The link opens this checkout. It does not sign anyone in." If a later version adds a token, these rules hold:

- A copied link carries the intent only. It never signs anyone in.
- The token rides only on the direct handoff (Android's Open in Chrome).
- The token lives 2 minutes, works once, is bound to the intent, and opens a session that can only finish that checkout.
- It is refused on a second device class and every use and refusal is logged.
- New procedure `checkout.handoffToken({ id })`, private, rate limited.
- A copied link opened by someone else works like any intent link: the first signed in reader claims an unclaimed intent (CK-1), and pays with their own wallet. Nobody else's session moves.

**Landed in Safari or Chrome (QA2).** "Continue with Google" and "Use email". No Sign in with Apple.

**The card as built (board c4).** The gate (`PayHandoffGate`) wraps `/pay/{intent}` and shows the card before any sign in or claim, so it names no item and uses the neutral Amped.Bio surface, not the creator theme. Title "Open this in your browser to pay". Body "{App} cannot finish a payment. Sign in and pay in {Safari or Chrome}. Your checkout stays open for 24 hours." iPhone: the two steps for the app (Instagram, Threads, Facebook, TikTok, X, LinkedIn, Snapchat), "Or copy the link and paste it into Safari.", Copy link. Android: Open in Chrome, Copy link, "If Chrome does not open, copy the link and paste it into Chrome." Both: the link in a well and "The link opens this checkout. It does not sign anyone in." (`HANDOFF_COPY`).

## 8. Short balance (c1, c3, CK-3)

- The pay sheet names the gap: "You need $5 USDC more." One button: "Add USDC in Wallet".
- The button opens the shipped Wallet Buy USDC panel at `/wallet?fund=usdc&ci={intent}`, full screen, prefilled with the shortfall. The intent moves to `awaiting_funds`.
- **Coinbase minimum (QA4).** When the shortfall is below Coinbase's minimum (from `onramp.options`, fallback `ONRAMP_LIMITS.minUsd`, 5), the panel prefills the minimum and says why in one line: "Coinbase's smallest purchase is $5. The rest stays in your wallet."
- The panel is unchanged otherwise. Its copy (`ONRAMP_COPY`, counsel approved) stays verbatim, including the agreement line, "Sold and delivered by Coinbase" and "US only" on Apple Pay and Google Pay. The panel picks the path by region and shows `ONRAMP_COPY.region` where Coinbase does not sell.
- USDC always lands in the fan's own wallet. Checkout never embeds the on-ramp (payment flow rule 1).
- **Arrived.** One button, "Back to checkout", returns to `/pay/{intent}`, which re quotes (section 5). The sheet never pays on its own.
- **Staging.** Coinbase's sandbox delivers nothing on chain, and the sandbox Arrived state follows the webhook alone (`docs/ops/cdp-policy.md`). The sandbox Arrived state must not enable Pay. The pay sheet reads the balance from chain. Test fans are funded from Circle's faucet (20 USDC on Base Sepolia per request).

## 9. Resume, checking and the Coinbase landing (c5)

**Resume bar.** Any app load with an open or awaiting funds intent for the signed in fan shows "Finish buying {item}" (CK-1). Tap opens `/pay/{intent}`.

**Checking.** After Pay, and on any return to a `signing` or `submitted` intent, the sheet shows "Checking your payment. It can only go through once." AmpedPay's nonce binding guarantees it: an authorization works once. The sheet polls `payments.status` by intent and shows the result. Build step (CK-5): CK-2 shows Checking only after a tap in the same tab (`Pay.tsx` phase state). `Pay.tsx` must show Checking when `checkout.get` returns `signing` or `submitted` (CK-Q43).

**Resume bar as built.** One line, "Finish buying {item}", with Finish and a Not now close (`CheckoutResumeBar`). Board c5.

**Coinbase landing `/r/{intent}` (CK-3).** The Coinbase account path redirects here. The page needs no session and names no item, creator or amount: "Your USDC is on its way. Go back to Amped.Bio to finish." One button, Open Amped.Bio, to `/pay/{intent}`. On iOS standalone mode the Apple Pay path is preferred, because it stays inside the frame and never leaves the app. The original tab keeps polling the intent and advances on its own.

**Unlock (D4).** The item opens when the relayer receipt lands (1 confirmation, `soft_unlock_confirmations`). The purchase is `confirmed_soft`. The indexer confirms at `final_confirmations` (12). A reorg that drops the payment revokes the grant and flags the row. Receipts send at final. Creator Sales shows Pending until final.

## 10. Error states (c7, c8)

One pattern for every error: what happened, whether anything left the wallet when that is true, one next step.

| State | Trigger | Copy | Next step |
| --- | --- | --- | --- |
| Price changed | Fresh quote differs in amount or fee | "The price changed. Was $12 USDC. Now $14 USDC." | Pay $14 USDC, or Not now |
| Store policy changed (CK-5) | The live store policy version differs from the one on the intent | "{seller} updated their store policy." with the policy sheet | Pay $12 USDC, or Not now |
| Payments paused | `payments_paused` on the server, or the on chain pause | "Payments are paused for a moment. Nothing was taken from your wallet." | Try again later; the intent stays open |
| Daily limit | Over `purchases_per_day_per_account` (20) or `purchase_usdc_per_day_per_account` (2,000 USDC) | "You reached today's limit for purchases. Try again tomorrow." | Close |
| Seller cannot take payments | Creator fails the seller rule, or the store is paused | "@handle cannot take payments right now. Nothing was taken from your wallet." | Back to the page |
| Item removed | Item or product removed, unpublished or suspended while the sheet was open | "This item is no longer for sale. Nothing was taken from your wallet." | Back to the page |
| Payment failed | Submit or chain failure | "The payment did not go through. Nothing was taken from your wallet." | Try again |
| Coinbase waiting, slow | Wallet Buy USDC states | `ONRAMP_COPY.walletPay.waiting`, `ONRAMP_COPY.slow` | Stay; the resume bar holds the purchase |
| Over 18 not yet available (#423) | 18+ item before A1 | "This item is for over 18s. It cannot be bought here yet." | Back to the page |
| Checkout not available (#423) | Quote on production or mainnet while only the mock exists | "Checkout is not available yet." | Close |
| Checkout ended | Unknown, expired or flag off | "This checkout has ended. Start again from the page." | Close |

"Nothing was taken" shows only when the server knows it is true: no submitted authorization, or a reverted one.

## 11. Join a membership (c2, MB-2)

Memberships ship after one time purchases (D8). The join sheet is drawn now so MB-1 and MB-2 build to it.

- One screen: "Every 30 days" and "Yearly" chips (never Monthly; amendment 3.1), the amount, the consent sentence, the seller line (section 5), the checkbox, then Join.
- The checkbox names the store policy from MB-2: "I agree to renewals every 30 days and to {seller}'s store policy."
- The checkbox starts unticked. Join stays disabled until it is ticked (express consent for recurring charges).
- "Every 30 days" everywhere. The contract counts 30 days, not a month. Every amount carries USDC.
- Review copy: "$5 USDC today, then $5 USDC every 30 days from your wallet. Cancel any time." The allowance line moves to a Details row.
- How renewals work says what happens when the 12 charge allowance is used up: a new allowance is asked for 7 days before. Proposed for MB-1; Rob confirms on #25.
- Renewal readiness 3 days before a charge and a 7 day grace with reminders on day 1, 3 and 6 (D7). Reminders go by push, email and the in app bell notification (CK-D3, Rob 3 Nov). No Telegram and no Amped Messages thread.
- Renewal Add USDC links open Wallet Buy USDC (spec 8), never a stacked sheet: `/wallet?fund=usdc&need={units}&returnTo=/library/memberships`. Build step (MB-1): `BuyUsdcFlow.tsx` reads `need` only with a checkout `ci` today (lines 177 to 181); MB-1 reads it for a renewal source too (CK-Q74).
- Seller pass lapsed: the join sheet shows "Not taking new members right now" with no Join (amendment 3.1). Board c2.

## 12. Analytics

Every event carries the intent id, the device class and the browser.

`checkout_started { source, kind, webview }` · `handoff_shown` · `handoff_completed` · `signup_from_checkout` · `wallet_ready` · `shortfall_shown { short_by }` · `add_usdc_from_checkout` · `onramp_arrived { seconds }` · `pay_tapped` · `price_changed` · `paid_soft { seconds_from_tap }` · `paid_final` · `checkout_resumed { from }` · `checkout_expired { last_status }`. Membership events (`renewal_ready_check`, `renewal_nudge_opened`, `renewal_saved`) arrive with MB-1.

Proposed targets, 90 days after the pilot opens: a fan with a balance reaches an open item in 2 taps and under 8 seconds at p50; a new fan with an empty wallet in under 2 minutes at p50; 70% started to paid with a balance, 35% with an empty wallet; 50% of handoffs completed; 60% of interrupted intents resumed.

## 13. Device QA matrix

Every money flow passes on each row before the pilot opens. Runs after CK-5.

| Device | Browser or shell | Must pass |
| --- | --- | --- |
| iPhone, iOS 17 and 18 | Safari | Sign up, Apple Pay path, one screen pay, soft unlock |
| iPhone | Home screen web app | Apple Pay inside the frame, Coinbase account path return, resume bar |
| iPhone | Instagram, TikTok, X, Facebook webviews | Menu steps per app, Copy link, intent survives |
| Android 13 and 14 | Chrome | Google Pay path, one screen pay, back button closes the sheet |
| Android | Instagram and TikTok webviews | `intent://` to Chrome with the token, intent survives |
| Android | Installed web app | Coinbase account path return |
| Desktop | Chrome, Safari | Side sheet, keyboard reach, focus rings |
| Any | Slow 3G and airplane mode mid submit | Checking your payment, no double charge |

## 14. Build

| PR | Branch | Scope | Needs | Days |
| --- | --- | --- | --- | --- |
| CK-0 | `docs/mobile-checkout` | This spec and the design QA record | none | 1 |
| CK-1 | `feat/checkout-intent` | Merged 2 Nov (#399) | none | 2.5 |
| CK-2 | `feat/pay-route` | `/pay/{intent}`, one screen sheet, fresh quote and Price changed, `CreatorThemeScope`, legibility guard, `$N USDC` formatter, the explainer line, the staging line, error states c7 and c8, Checking, the Over 18 redirect, a mock `PaymentProvider`, the seller line without a policy link. Buy on public pages calls `checkout.start` and navigates | CK-1 | 3 |
| CK-3 | `feat/checkout-wallet-handoff` | Add USDC in Wallet with the prefill and the Coinbase minimum line, `awaiting_funds`, Back to checkout, `/r/{intent}`, sandbox Arrived never enables Pay | CK-2 | 1.5 |
| CK-4 | `feat/webview-handoff` | Merged 3 Nov (#417). Webview detection, per app menu steps on iPhone, Open in Chrome on Android, Copy link with the intent only. No token | CK-1 | 3 |
| Follow ups | `fix/414-review-followups` (#423), `fix/416-review-followups` (#424) | #423: `checkoutProvider()` refuses the mock in production and on mainnet, `paid` quote state, 18+ fails closed. #424: conditional `awaitFunds` update, `awaitFunds` only with checkout on. Both target merged branches: retarget to `development`. #423 needs a rebase (conflict in `checkout-quote.test.ts`) | CK-2, CK-3 | 0.5 |
| CK-5 | `feat/checkout-live` | The sheet calls PAY-2 in place of the mock. Unlock on the first confirmation. Promoter line from the intent. Store policy link and sheet, `storePolicyVersionId` on the intent at quote, Store policy changed, version carried to the Purchase | CK-2, PAY-2, C9 | 2.5 |

Rules: at most four open PRs; CK-2 stacks on CK-1 only (now merged); flags stay off in production; each PR moves its Screen Review rows to In PR and runs the Prism 2.2 gate against boards c1 to c8.

## 15. Acceptance

1. A fan with a balance goes from Buy to an open item with one tap on the sheet. No Amount step, no Review step, no checkbox.
2. The sheet re quotes on every open. A changed amount or fee shows Price changed before Pay.
3. A short balance opens Wallet Buy USDC prefilled with the shortfall, or with Coinbase's minimum and the reason line. Back to checkout returns to the same intent.
4. An 18+ item never shows the pay sheet without an `age_over_18` pass.
5. On iPhone inside Instagram, TikTok, X and Facebook, the card shows the menu steps for that app and Copy link. No button opens a blank screen.
6. A copied link never signs anyone in. The handoff token works once, within 2 minutes, for its intent only.
7. `/r/{intent}` renders with no session and names no item, creator or amount.
8. Every error state in section 10 renders with its next step. "Nothing was taken" shows only when true.
9. On staging, the sandbox Arrived state never enables Pay, and every staging page shows the test USDC line.
10. The join sheet's checkbox starts unticked and Join is disabled until it is ticked. "Every 30 days" everywhere.
11. No amount shows `$` without USDC. No banned word (`CONTENT_BANNED_TERMS`, plus stake, staking, pool and tREVO on store and checkout surfaces). No dashes.
12. Every control is at least 44 by 44. Body text meets 4.5:1 and large text 3:1 against the creator theme after the legibility guard.
13. Every pay and join sheet shows the seller line, in counsel's words, on every state where the creator is known. From CK-5, every Purchase carries the store policy version shown on its intent.
14. The checkout flag never turns on in production or on mainnet while the mock provider is the only provider; the quote refuses it (#423).
15. An 18+ item without a pass never shows Pay: it shows the Over 18 check (A1) or the fail closed line (#423).

## 16. Edits this spec makes to other specs

These sections are superseded here rather than edited in place, as `docs/features/ampedpay.md` does for the memberships and content specs. The next PR that touches each file folds the change into its text.

**Content system (#20, `docs/features/content-system.md`):**

- 3.8 Storefront: "Buy and Join open sign up with `?next=` back to the product" becomes: Buy and Join call `checkout.start` and open `app.amped.bio/pay/{intent}`; a signed out fan signs up with `?ci={intent}` and lands back on the pay sheet.
- 3.8 product cards and locked cards: amounts read `$3 USDC` (D6). Locked cards carry the amount on the button (Buy $3 USDC, Join $5 USDC every 30 days) and open the pay sheet in one tap.
- 3.8 product page: Buy sits in a sticky bottom bar on phones.
- 3.9 The sheets: the one screen sheets of sections 5 and 11. The required checkbox applies to memberships only; one time purchases show the counsel seller line of section 5 above the button. The fee row comes from the quote. A short balance follows section 8.
- 3.9 Purchase flow step 1: `payments.quote({ intentId })`, the promoter read from the intent, a fresh quote on every open.
- 3.9 step 4: the relayer receipt sets `confirmed_soft` and opens the item (D4); the indexer sets `confirmed` at final.
- 3.9 step 5: `payments.status` reads by intent.
- 3.9 Promoters: `checkout.start` copies `?via=` onto the intent (CK-1). The cookie, when consent allows it, is a fallback behind the intent.

**USDC wallet and on-ramp (#29, #5, `docs/features/usdc-wallet-onramp.md`):**

- 3.7 entry: from checkout the link is `/wallet?fund=usdc&ci={intent}` with the shortfall. Amount is prefilled with the larger of the shortfall and Coinbase's minimum, with the reason line when the minimum is larger (QA4).
- 3.7 step 4: with an open intent the Coinbase account path redirects to `app.amped.bio/r/{intent}`, which needs no session and names no item, creator or amount.
- 3.7 step 6 Arrived: Back to checkout when `ci` is set; the pay sheet re quotes and never pays on its own. On staging the sandbox Arrived state, driven by the webhook alone, never enables Pay.
- 3.7 mobile note: social app browsers follow section 7 of this spec; Buy and Join move to Safari or Chrome before the fan reaches Wallet.
- Decision 8: in Wallet, unchanged (USDC). On creator money surfaces, `$3 USDC`, never `$3` alone, with the one line explainer on the first money sheet (D6).

**Memberships and payments (#25).** Not in the repo. Amended by project doc `claude/amped-memberships-payments-amendment-2026-11-02.md`:

- 3.2: `CheckoutIntent` (as built in CK-1). `Purchase` gains `confirmed_soft`.
- 3.3: `UsdcPaymentVerifier.startCheckout` returns `/pay/{intent}`.
- 3.5: `checkout.start`, `checkout.get`, `checkout.resumable`, `checkout.handoffToken`. `payments.quote` takes the intent. `payments.status` reads by intent.
- 3.5 renewals and decision 4: readiness check at 3 days, 7 day grace with reminders on day 1, 3 and 6.
- 3.8: one screen pay, membership on one screen, the step up rule, checkbox on memberships only, the review copy of section 11.
- 3.9: payments to creators do not require a verified email. Receipts go to the address on file.
- 3.13 items 8 and 14: the 7 day grace and the unticked checkbox on memberships only.
- Payment flow rule 1: unchanged in substance. The short balance hands off to Wallet, Fund and the resume bar returns to the item.

## 17. Open items

- Counsel: D5 (no checkbox on one time purchases), D6 (`$3 USDC` display), soft unlock, 7 day grace, the step up threshold, the handoff token. These are in the existing counsel packet.
- Real device test of every app in section 13 before the checkout flag turns on (CK-4 merged before it ran).
- Counsel: whether and where Alabama HB 164 Section 9 applies (AD-D1 text is interim).
- Fan shell: the shipped dock (Home, Page, Inbox, Wallet, More, Library under More) stays until a fan shell is specced (CK-D4). That shell uses rail Start Home, Explore, Library, Inbox and fan dock Home, Library, Inbox, Wallet, More (CT-D1).
- Rob confirms the allowance renewal line for MB-1 on #25.
- Desktop pay sheet boards before C9.

## Revision log

- 2026-11-04: Revision 3.2. CK-5 built on `feat/checkout-live`: the sheet pays through AmpedPay when the quote names it; the store policy link, sheet, version on the intent and Store policy changed; Checking on return to a signing or submitted intent; Verified chip, network fee row and the access line in place of "Yours to keep". Not in CK-5: the cover beside the title, the promoter line (C12) and the step up above 100 USDC.

- 2026-11-03: Revision 3.1. Rob's decisions on the Full QA 2 list: CK-D1 (counsel sentences only, then the Store policy link), CK-D2 (no token in v1; CK-4b row removed), CK-D3 (bell as the third renewal channel), CK-D4 and CT-D1 (docks), AD-D1 (Alabama HB 164 Section 9 warnings and SAMHSA helpline on the 18+ steps, interim pending counsel). Boards c1, c4, c5, c6 and c9 updated.

- 2026-11-03: Revision 3 (Full QA 2, checkout group). Seller line in counsel's words on every sheet state; refund sentence held for CK-D1. CK-4 as merged without the token (CK-4b, CK-D2). Over 18 fails closed until A1, quote refusal, ended and paid states (#423). Follow ups #423 and #424 to retarget. Join chips Every 30 days and Yearly; seller lapsed join state; renewal Add USDC through Wallet. No Telegram surfaces. Build steps for the Verified chip, cover, network fee row, Checking on return, Prism tokens. Boards c1 to c8 redrawn as Prism 2.2 HTML from the code; c9 added.

- 2026-11-03: Revision 2. Seller line on the pay and join sheets (CK-2), store policy link, sheet, version and Store policy changed (CK-5), join checkbox names the store policy. Source: COUNSEL-ADULT v1.1 and docs/features/store-policy.md (#420).
- 2026-11-02: Revision 1 (CK-0). First repo copy of the mobile checkout spec. Records D2 to D8 (24 Oct), the shortfall rule, QA1, QA2 and QA4 (29 Oct), the handoff token rule, the Full QA fixes and CK-1 as merged. Redrawn boards c1 to c8 (version 3, 29 Oct).
