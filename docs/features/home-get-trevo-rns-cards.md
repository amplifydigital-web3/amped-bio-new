# Home Get tREVO and RNS name cards

Status: built, 2026-10-23. Target branch: `development`.
Owner: Rob Frasca. Built by Claude, 2026-10-23.
Design canvases: Home Get tREVO (https://claude.ai/artifact/JBmo1SBBeoeHfwAXSN8LYF), Wallet RNS names (https://claude.ai/artifact/U7n12PjXEJ7oRDUc7VXocc).

Direction from Rob, 23 Oct: move the Faucet and the invite link share from the Wallet to Home and improve their UI. On the Wallet, make it obvious that a name in My RNS names opens its management pages.

## 1. What changed

### 1.1 Get tREVO moves to Home

| Before | After |
|---|---|
| Wallet, Get tREVO section: Referee card, Testnet faucet, Invite creators | Home, left column under Page status: the same three cards in a new `GetTrevoSection` |
| Wallet showed the full section | Wallet shows one `GetTrevoRow` that links to Home and reads the faucet status ("Faucet: Ready") |
| Tokens tab empty state "Get tREVO" scrolled to the Wallet faucet | It opens `/home?open=faucet` |

`/home?open=faucet` scrolls to the faucet card, focuses its heading and drops the param. `focusFaucetHeading()` now returns `false` when the card is not on the page.

The Fund dialog keeps its own faucet request. It is unchanged.

### 1.2 Daily faucet card

All request states are kept: loading, did not load, setup, ready, sending, sent, cooldown, paused and empty.

- The title is "Daily faucet" with a droplet tile. "Watch how" is now "Watch" (the aria label is unchanged).
- The amount leads in Bebas, followed by "tREVO every 24 hours". The amount is muted while setup is open.
- Setup lists only the open page steps, with "N page steps left", the progress bar and one action per step. Done steps sit behind "Show done steps".
- Ready shows "Ready. Page steps done." above the request button.
- Cooldown is a ring that drains over the 24 hour window. The countdown updates every second. The screen reader text is announced once a minute (053 I09 kept).
- The card ends with the short line "Testnet only. tREVO has no cash value." The full testnet notice stays in the Home Testnet card.

### 1.3 Invite creators card

- The Copy button sits next to the link field.
- A share row: native share (only where the browser has `navigator.share`), X, Telegram, WhatsApp and email. Each is an icon button with an aria label. Links open in a new tab.
- A stat strip: Joined, Unclaimed, Claimed. "Unclaimed" is used rather than "Ready to claim" because some joined creators have no linked wallet yet.
- "Review and claim rewards" opens the referral list when anything is unclaimed. Claiming still goes through the review panel (D24). Reward and Claim wording is kept (D1).
- Server: a new `referralInvite.stats` procedure returns `joined`, `claimed` and `unclaimed` across every referral (a set `txid` is claimed or processing), so the strip is right when the list is paged. It lives in its own file so `referral.ts` is untouched.

### 1.4 RNS name cards

My RNS names (now "Your RNS names") is a two column card grid, one column below 768.

- Every card has a visible **Manage** button. Its accessible name includes the full name ("Manage robfrasca.revotest.eth").
- A line above the grid says what Manage holds: profile, identity, extend, transfer.
- Expiring (30 days or less): a warning band "Expires in N days" and an **Extend** button that opens `flow=extend`.
- Grace (1 day after expiry): a warning band "Expired. Renew by <date> or it is released." and a **Renew now** commit button. Manage drops to secondary there.
- Not verified, identity on: a **Verify** button that opens the Identity tab.
- Primary and Verified chips stay. A dashed "Register another name" tile ends the grid and focuses the search.
- Hover lifts the card with the indigo ring. Reduced motion turns the lift off.

`NameRow` is unchanged and still used by the address view.

## 2. Decisions

| Decision | Choice | Why | Alternative |
|---|---|---|---|
| Wallet after the move | Keep one Get tREVO row that links to Home | Creators look for tokens in the Wallet. The row also shows when the faucet is ready | Remove the section from the Wallet completely |
| Set primary on a card | Not in this PR | There is no set primary flow yet. It needs a reverse registrar transaction and its own review step | Add a Set primary flow and put it on non primary cards |
| "On your page" on a card | Not in this PR | The list query has no page binding per name | Read the binding per card |

## 3. Files

| File | Change |
|---|---|
| `apps/client/src/components/panels/home/GetTrevoSection.tsx` | New. The Home section and the `?open=faucet` handling |
| `apps/client/src/components/panels/home/HomePanel.tsx` | Mounts the section |
| `apps/client/src/components/panels/wallet/MyWalletPanel.tsx` | Replaces the section with `GetTrevoRow` |
| `apps/client/src/components/panels/wallet/faucet/GetTrevoRow.tsx` | New. The Wallet pointer row |
| `apps/client/src/components/panels/wallet/faucet/FaucetCard.tsx` | Redesigned card |
| `apps/client/src/components/panels/wallet/faucet/fundRow.ts` | `HOME_FAUCET_PATH`; `focusFaucetHeading` returns a boolean |
| `apps/client/src/components/panels/wallet/referral/InviteCard.tsx` | Share row, stat strip, inline Copy |
| `apps/client/src/components/panels/wallet/ProfileTabs/components/TokensTab.tsx` | Get tREVO opens Home |
| `apps/client/src/components/panels/wallet/rns/shared.tsx` | `NameCard`, `RegisterTile` |
| `apps/client/src/components/panels/wallet/rns/MyRnsNames.tsx` | Card grid and actions |
| `apps/client/src/components/panels/wallet/rns/RnsTab.tsx` | Passes the flow and view on open |
| `apps/server/src/trpc/referralInvite.ts` | New. `referralInvite.stats` |
| `apps/server/src/trpc/index.ts` | Registers `referralInvite` |

## 4. Checks

- `tsc -b` (client) and `tsc --noEmit` (server): clean. The client reports the pre-existing `ProtectedRoute.test.tsx` `afterEach` error, unrelated.
- `vite build` (client): passes.
- `eslint`: no errors.
- New Vitest tests: `fundRow.test.ts` (6) and `shareTargets.test.ts` (2), all passing.

## 5. Staging QA

1. Home shows Get tREVO under Page status. At 1360 and up the faucet and invite cards sit side by side.
2. The faucet in each state: setup with open steps, ready, request sent, cooldown ring, paused.
3. The Wallet shows the Get tREVO row. Selecting it lands on Home with focus on "Daily faucet".
4. Tokens tab with a zero balance: "Get tREVO" lands on the Home faucet.
5. Invite: Copy, each share target, the stat strip, Review and claim rewards.
6. RNS: a name over 30 days out, one expiring, one in grace. Manage opens the name page. Extend and Renew now open the extend flow. Verify opens Identity.
