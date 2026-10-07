# QA fixes 5: wallet activity, pool block, RNS confirm, broadcast pilot, logo

Source: Rob's staging pass, 7 Oct 2026, on app.staging.amped.bio and staging.amped.bio at development 39f4b56. Tracker IDs are QA-xxx.
One commit per item. `apps/client`, `apps/landingpage`, and one server env default.

Numbering: the first five commits on this branch name these items QA-041 to QA-045. Another QA pass filed QA-041 to QA-051 the same morning, so they were renumbered to QA-052 to QA-056 in the code, this checklist and the tracker. The commit messages keep the old numbers; the renumber commit maps them.

| QA | Area | Change | Files | How to check |
|---|---|---|---|---|
| QA-040 | Shell brand | The Amplify mark in the editor rail, the mobile top bar, and the public header and footer. Carried over from #286, which was merged before these commits were pushed. | `client/assets/amplify-mark.svg`, `shell/BrandMark.tsx`, `shell/Rail.tsx`, `shell/TopBar.tsx`, `landingpage/public/logo.svg`, `layout/PublicHeader.tsx`, `layout/PublicFooter.tsx` | Desktop editor: the mark heads the rail, click: `/home`. 390: the mark leads the top bar. Public site: header 28 high, footer 21 high. |
| QA-052 | Wallet Activity | The tab rendered "Wallet did not load" for any wallet with pool reward payouts. Internal transfers now key by block and position and show "Internal transfer, no hash" in the detail. | `wallet/activity/activityModel.ts`, `ActivityTab.tsx`, `ActivityRow.tsx` | `/wallet?tab=activity` as @rob: the list renders (415 transfers on the explorer, most internal). Open a reward payout row: the Transaction line reads Internal transfer, no hash, no copy or explorer button. Hashed rows still copy and open in the explorer. Switch Transfers, Staking, All. |
| QA-054 | Pool block | Stats grid is two columns at every width: Total staked and Fans, then Creator share in full. The editor's live preview now renders the same Prism block as the public page instead of the legacy three tile card. | `landingpage/blocks/CreatorPoolBlock.tsx`, `client/blocks/CreatorPoolBlock.tsx` | staging.amped.bio/rob at 390: the three values each sit on one line; nothing scrolls sideways. Editor `/page` Phone preview: the block matches the public page (creator colors, View pool, testnet line). Desktop preview: same, two columns. |
| QA-055 | RNS register | The wallet confirm step no longer waits forever. A wallet that does not answer in two minutes, or a sent transaction not included in three, lands on the error card with a reason and the hash link. The error is logged to the console. | `hooks/rns/useRegistration.ts`, `wallet/rns/RegisterFlow.tsx` | Wallet > RNS > register a name, Confirm. If the wallet popup never answers: after two minutes the card reads "Your wallet did not answer within two minutes" with Retry. Console carries `RNS write failed in the wallet` plus the raw error; send that to the tracker. Renew, transfer and publish share the same tracked write. |
| QA-056 | Broadcast pilot | `BROADCAST_INVITE_ONLY` defaults to true only when `APP_ENV=production`. Staging and local runs open Broadcast to every pool owner unless the variable is set. | `server/src/env.ts`, `server/.env.example` | After the server deploy, My Pool > Broadcasts as a pool owner not on the pilot list: the composer is open, no waitlist line. Admin > Broadcasts > Pilot senders still works. If staging runs with `APP_ENV=production`, set `BROADCAST_INVITE_ONLY=false` there instead. |

## Not fixed in code

- QA-053 Theme videos: ten background MP4s are missing from the S3 bucket `amped-bio`, prefix `themes/backgrounds/`: Big_Sky, Bubbles, Midnight_Grove, Neon_Stars, Night_City, Plasma, Savannah_Sunset, Sleigh_Ride, Sunset_Beach, Urban_Sunset. Their thumbnails exist, the videos return 404. The bucket is shared with production, so these themes are broken there too. The other 41 videos stream. Needs the source files uploaded; no code change. The QA-004 poster fallback shows the thumbnail meanwhile.

## QA-052 root cause

`mergeByHash` keyed every row with `item.hash.toLowerCase()`. The explorer's `/address/:address/transfers` returns `transactionHash: null` for internal base token transfers (pool reward payouts from the staking contract). The first null threw inside `useMemo`, the ErrorBoundary caught it, and the Wallet tab showed the generic "Wallet did not load" card. Rob's wallet has 415 transfers and the newest ten are all payouts, so the tab never rendered.

Fix: `ActivityItem` carries `key` (lowercased hash, or `internal:<block>:<position>` when there is no hash) and `hash: string | null`. The merge dedupes on `key`, so hashed rows still collapse across pages and payouts all show. The detail panel hides the copy and explorer actions when there is no hash.

## QA-054 notes

- The public block used `grid-cols-3`. In a 348 wide phone column each cell is 93 px: "0.0015 tREVO" wrapped to two lines and "48% of pool rewards" to four. Two columns gives 160 px per cell and Creator share a full row.
- This also closes QA-051 (editor preview renders the legacy Creator pool block, 0 REVO).
- The editor's `Preview.tsx` still rendered the legacy pool card (three tiles with icons, "REVO", "Stake in this Pool", Montserrat). That card could not fit a 390 frame. It is now a port of the public Prism block (040), with an inert View pool button since the preview is not navigable.

## QA-055 notes

- Root cause not confirmed. The hang is in `useTrackedWrite`: `writeContractAsync` (the Web3Auth embedded wallet confirm) never resolved, and `waitForTransactionReceipt` had no timeout. Both are now bounded, with the error logged, so the next occurrence carries a diagnosis in the console and on the tracker.
- Reproducing needs a real testnet registration from Rob's wallet. Not done from this environment.

## QA-056 notes

- The staging server env is not in the repo. The code default now opens the pilot outside production. Confirm staging's `APP_ENV`; if it is `production`, set `BROADCAST_INVITE_ONLY=false` on staging.
- The admin Pilot senders tab keeps working; it only matters while the gate is on.

## Verification

- Client: `tsc --noEmit` clean; `vite build --mode staging` passes; eslint clean on the changed files.
- QA-052: unit check on `fromTransfer` and `mergeByHash` with null hashes (two internal transfers keep two rows; `0xABC` and `0xabc` across pages collapse to one). Reproduced on staging by calling the explorer for @rob's address: the first page of transfers has ten rows with `transactionHash: null`, matching the `null.toLowerCase()` stack in the console.
- QA-054: measured on staging.amped.bio/rob in a 390 wide same origin frame before the change (values on 2 and 4 lines).
- Server: `vitest` broadcast suite 29 passed. `tsc --noEmit` has the same 246 errors before and after in this environment, all from the Prisma client that cannot be generated here; none in `env.ts`.
- Landing: same pre-existing Prisma errors, none in the pool block.
- Not run inside the live app from this environment. Check on staging with the table above after the deploy.
