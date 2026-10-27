# Batch 13a: Analytics tabs, Overview and Audience (Screen Review 093)

Each batch PR documents itself in its own file under `docs/prism/`, so open PRs never conflict on `docs/PRISM.md`.

Based on `development`. Batch 13b (Campaigns and Ad pixels) follows on top of this branch.

## Layout

| Piece | File | Rule |
|---|---|---|
| Tabs | `analytics/AnalyticsPanel.tsx` | Overview, Audience, Campaigns in `?tab=` (I01). Getting started jumps switch tab and focus the section |
| Header row | `analytics/AnalyticsHeader.tsx` | Range select as a G2 well (44, 233 wide, flex at 390) opening six radio rows; choice in `?range=` (I07). Export opens Daily totals and Event records (D4); Exporting while pending; Export failed toast with Retry (I08). Icon button at 390 |
| Freshness | `AnalyticsPanel.tsx` | One line per tab: "Last 28 days compared with the previous 28 days. Updated 1 min ago." plus the public page as a ghost link (I05, I06). Card footers are gone |
| Overview | same | Get started, KPI strip, freshness row with Show 4 more metrics, then Activity and Links left of the golden line and Insights and Live right of it (I02). At 390: Insights, Activity, Links, Live (I03) |
| Audience | same | Traffic sources and Technology left, Locations right, then When people visit and Returning visitors full width |
| Campaigns | same | Campaign links, Link tags and Ad pixels moved here unchanged; 13b rebuilds them |
| States | `AnalyticsPanel.tsx`, `Skeleton.tsx` | Layout matched skeletons after 400ms, static under reduced motion (I09). Error card "Analytics did not load" with Retry; the header row stays usable (I10) |
| Footer | `definitions.ts` | Privacy footer verbatim (D5) on every tab; How visitor privacy works as a disclosure row on Overview and Campaigns. Step 5 shows only when a Meta or TikTok server token is saved |

## Cards

| Piece | File | Rule |
|---|---|---|
| Card shell | `AnalyticsCard.tsx` | G1 clear r21, eyebrow title with the nav marker, info button, optional meta line (I15) |
| Definitions | `InfoTip.tsx` | Opens on click, tap, Enter or Space. Popover on desktop, bottom sheet at 390; Escape returns focus (I16) |
| KPI tiles | `KpiTiles.tsx` | Views, Visitors, Link clicks, Click-through; the secondary four behind Show 4 more metrics, remembered (I04, I12, I14). Change lines 13/16 with arrow and spoken direction; No prior data in ink-2 (I13) |
| Activity | `TrendChart.tsx` | D3 series: indigo solid, create ink dashed. G2 slab plot, crosshair tooltip, Left and Right read each bucket aloud, Show as table with formatted dates (I17) |
| Links | `TopLinksTable.tsx` | 55 rows as buttons (Open details for {label}), Click rate column, five at rest, empty state with Add a link (I20 to I22) |
| Link detail | `LinkDetailDialog.tsx` | Shared Dialog, 2 by 2 stats, clicks chart, both breakdowns stacked, error card with Retry, Edit this link, focus back to the row (I24 to I26) |
| Insights | `InsightsCard.tsx` | AI summary only on Write summary, under the approved disclosure (D1). Writing, written, failed and no views states. Findings name their tone in text; three at rest (I23) |
| Live | `RealtimeCard.tsx` | Static success dot, count 26/33, five 44 rows, Show more, error card, empty state with Copy page link (I18, I19). Country and device only (D4) |
| Breakdowns | `BreakdownCard.tsx` | Prism chips, 55 rows with visitors and clicks shown without hover, country by name, error card per card (I34, I35) |
| Heatmap | `ActivityHeatmap.tsx` | D3 ramp on a G2 slab, not focusable, Show as table with every value; 7 by 8 bands at 390 (I36) |
| Returning visitors | `RetentionCard.tsx` | D3 ramp, ink text up to 0.62, white only on 0.85. Tap or focus a cell to read it. Coverage from the same 8 weeks (I27 to I29) |
| Guides | `HowTo.tsx` | G0 disclosure row 55, closed by default, open by default only when its section is empty; `amped_howto_` keys kept (I41) |
| Palette | `format.ts` | D3 data palette replaces the old blue, orange and green (I43). No text below 13px (I44) |

## Server

| Change | File | Why |
|---|---|---|
| Live returns only events from the last 30 minutes and never city | `services/analytics/queries.ts` `getRealtime` | I18, D4 |
| Daily totals export: one row per local day, source and link | `queries.ts` `exportDailyTotalsCsv`, `trpc/analytics.ts` `exportCsv` | D4. `format` defaults to `events`, so old callers keep event records |
| Retention returns `coverage` and `returningShare` for the same 8 weeks as the cohorts | `trpc/analytics.ts` `retention` | I28 |

## Privacy Notice

`apps/landingpage/src/content/legal/privacy.md` and `docs/CREATOR_ANALYTICS.md` now say what the AI summary sends: totals for the period and the period before, top sources, devices, visitor counts and up to 10 link names. Rob chose to update the notice to match the approved D1 line and the code (2 Oct).

## Not in this PR

- `GettingStartedCard.tsx` (I11). Open PR #249 changes it. It is restyled once #249 merges.
- Campaign links, Link tags and Ad pixels rebuild, including the D2 terms checkbox and the I37 pixel save fix. Those ship in 13b.
