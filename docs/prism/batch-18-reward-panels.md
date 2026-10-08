# Batch 18: Leaderboard, Reward and Reward Pools panels (Screen Review 086)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

## Rows

| Row | Screen                                           | Result                                                                                                                                             |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 086 | Hidden panels: Leaderboard, Reward, Reward Pools | Built. The three panels are deleted and their old URLs redirect. I06 (Top fan in pool details) waits on a public fan procedure and a privacy check |

## Decisions applied

| Id  | Answer                                                        | Applied as                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Recommendation: delete all three                              | `LeaderboardPanel.tsx`, `RewardPanel.tsx` and the empty `RewardsPanel.tsx` are deleted with their folders. `reward`, `rewardPools` and `leaderboard` leave `EDITOR_PANELS`, `PANEL_TITLES` and the Layout switch, so no build imports or renders them. /leaderboard and /rewardPools redirect to /explore?tab=pools, as the 086-Redirects board shows                                                                                                                                                                                |
| D2  | Wording approved                                              | /reward redirects to /my-pool with replace. Silent: no toast. No editor entry and no My Pool reward section, because the npayme program is not confirmed live. `VITE_REWARD_URL` is removed from the client env files (development, testing, staging) and from `vite-env.d.ts`, so no build frames reward-dev.amped.bio. If Rob confirms the program is live, it returns as the I09 My Pool link out with the approved strings (Reward program on npayme; Run by npayme. Opens in a new tab.; the third party note), never an iframe |
| D3  | Wording approved, under the recommendation: sort options only | Explore Pools offers Most fans and Most staked as sort options. No rank numbers, no Top pools header, no Ranked by line, no Top labels, no rank by rate. The boards draw the J7 ranked view; the recorded answer is the recommendation (sorting only), which is the board's "If you choose otherwise" branch. The ranked strings in the wording block (Top staked, #{n}, Top pools, Ranked by total tREVO staked) are not built and wait on counsel                                                                                  |

## What changed

### 086

| Piece          | File                                                                                                              | Rule                                                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel registry | `client/src/types/editor.ts`                                                                                      | `reward`, `rewardPools`, `leaderboard` removed from `EDITOR_PANELS` (I01, I10)                                                                                                                                                                                 |
| Redirects      | same, `LEGACY_PANEL_REDIRECTS`                                                                                    | leaderboard and rewardPools to `explore` with `tab=pools`; reward to `my-pool`. Handled by the existing legacy redirect in `pages/Editor.tsx` with replace, keeping the rest of the query (I01, I10, D1, D2)                                                   |
| Layout         | `client/src/components/Layout.tsx`                                                                                | Leaderboard and Reward imports and cases removed, so the panels leave the bundle. No reference to RewardsPage remains (I01, I10)                                                                                                                               |
| Titles         | `client/src/components/shell/destinations.ts`                                                                     | Reward, Reward pools and Leaderboard titles removed (I01, I08)                                                                                                                                                                                                 |
| Deleted code   | `panels/leaderboard/LeaderboardPanel.tsx`, `panels/reward/RewardPanel.tsx`, `panels/rewardpools/RewardsPanel.tsx` | Mock pools, Unsplash portraits, USD valuations, APR and Annual yield, the Top Staker badge, the dead selectedPoolId path, the Creator Pool Leaderboard heading and the npayme iframe are gone (I04, I05, I07, I08, I09, I10, D1)                               |
| Reward URL     | `client/.env.development`, `.env.testing`, `.env.staging`, `src/vite-env.d.ts`                                    | `VITE_REWARD_URL` removed; nothing reads it (I09, D2)                                                                                                                                                                                                          |
| Banner targets | `packages/constants/src/banner.ts`, `client/src/components/Banner.tsx`                                            | `rewardPools` and `leaderboard` now map to no destination, like `reward`. A stored banner that names one renders without its link. The values stay readable so old stored banners still parse. The admin select already lists only the live destinations (I02) |
| Sort labels    | `client/src/components/panels/explore/ExplorePanel.tsx`                                                           | The fan sort reads Most fans (was Most backed). Most staked unchanged. Default sort, values and the server sorts are unchanged (I03, D3)                                                                                                                       |
| Sort sheet     | same                                                                                                              | At 390 the Pools sort sheet title reads Sort pools (D3 wording). Users keeps Sort                                                                                                                                                                              |
| Testnet line   | `client/src/components/panels/explore/components/PoolsTab.tsx`                                                    | The verbatim testnet line on the Pools list: above the list at 390, under it on desktop, as the boards show. Reuses `TestnetLine` from the pool panel (trust note, design QA)                                                                                  |

## Instruction coverage

| Id  | Sev | Status        | Where                                                                                                                                                                                                                                                                                                |
| --- | --- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I01 | S1  | Done          | `editor.ts`, `Layout.tsx`, `destinations.ts`                                                                                                                                                                                                                                                         |
| I02 | S2  | Done          | `banner.ts`, `Banner.tsx`. Admin select was already live destinations only                                                                                                                                                                                                                           |
| I03 | S2  | Done as sorts | Most staked and Most fans already sort real pools on the server (`pools.fan`); label aligned to D3. The list keeps the row 043 medium cards, which already show Total staked in tREVO and Fans. Section 9 flat rows belong to row 043                                                                |
| I04 | S1  | Done          | The only APR and Annual yield strings were in the deleted Leaderboard                                                                                                                                                                                                                                |
| I05 | S1  | Done          | The only USD valuation was in the deleted Leaderboard. Explore cards show tREVO, 4 decimals max, trailing zeros removed (`formatTokenAmount`)                                                                                                                                                        |
| I06 | S2  | Not done      | Top fan in pool details needs a public procedure: `pools.creator.getFans` is private and owner only. Showing a fan's name and stake to every viewer is new personal data on a public surface and needs a privacy-parameters check first. My Pool Top fans (068) already exists. Belongs with row 046 |
| I07 | S2  | Done          | The dead selectedPoolId path is deleted. Explore Pools cards already open pool details in the commitment field panel                                                                                                                                                                                 |
| I08 | S3  | Done          | Heading deleted with the panel; no second heading on Explore                                                                                                                                                                                                                                         |
| I09 | S2  | Done          | No build frames the reward program. The link out is not built (D2)                                                                                                                                                                                                                                   |
| I10 | S3  | Done          | Route, commented render and the empty file deleted                                                                                                                                                                                                                                                   |

## Notes

- `VITE_SHOW_REWARD` is still set in the client env files and declared in `vite-env.d.ts`, but nothing reads it. It is left for the flag clean up.
- The public pools directory (`landingpage/.../PoolsPageContent.tsx`) still labels its sorts Most Fans and Most Staked in title case. D3 wording names the public directory too; aligning it is a landingpage change outside this row's build.
- Commented sidebar entries named in the evaluation no longer exist; the D01 rail replaced `Sidebar.tsx` earlier.
- The constants package `dist` was rebuilt locally for validation only; `dist` is not tracked.
- `docs/PRISM.md` still says rewardPools redirects to /home and that rewardPools and leaderboard banners open Explore. Update those two lines when this merges: the panels redirect through `LEGACY_PANEL_REDIRECTS` and stored banners naming them render without a link.

## Waits

- Counsel: rank numbers and Top labels on a public list (D3). Until then Explore sorts only.
- Rob: whether the npayme program is live (D2). If live, build the I09 My Pool link out with the approved strings and restore a reward URL env var.
- Row 046: Top fan in pool details (I06), after a public fan procedure and a privacy check.

## How to test on staging

1. Sign in at https://app.staging.amped.bio and open https://app.staging.amped.bio/leaderboard: Explore opens on Pools and the URL reads /explore?tab=pools.
2. Open https://app.staging.amped.bio/rewardPools: the same.
3. Open https://app.staging.amped.bio/reward: My Pool opens, the URL reads /my-pool, no toast and no iframe.
4. Open the legacy forms https://app.staging.amped.bio/?p=leaderboard and ?p=reward: same landings.
5. On Explore Pools open Sort (at 390 the sheet reads Sort pools): Most fans, Most staked, Newest, Name A to Z, Name Z to A. Pick Most staked: pools order by total tREVO staked. No rank numbers, no Top pools header, no APR, no USD.
6. The testnet line shows above the list at 390 and under it on desktop.
7. In https://admin.staging.amped.bio set a banner: the destination list is the live destinations only. A banner stored earlier with leaderboard or rewardPools shows its text with no Open button.

Screenshots are not included.
