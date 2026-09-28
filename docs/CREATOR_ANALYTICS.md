# Creator Analytics

The Analytics panel in the client dashboard gives every page owner the analytics that Linktree
sells on its Pro and Premium plans, plus features no link-in-bio competitor offers. Every feature
is available on every account.

## What the dashboard shows

| Area | Details |
| --- | --- |
| Getting started | First-run checklist (share page, create a campaign link, connect pixels, read insights) that ticks itself off from real data |
| Headline metrics | Views, unique visitors, link clicks, visitor click-through (unique clickers ÷ unique visitors, the spec's CTR), clicks per view, average time on page, new members, returning visitors. Each has an info bubble with its definition and source, and change vs the previous period |
| Members | Accounts that signed up through the creator's page (referral records), with visitor to member conversion |
| Returning visitors and retention | Consented visitors only, shown with coverage. Weekly retention cohorts for the last 8 weeks |
| Campaigns | Saved campaigns with their own IDs (`utm_id`), links, QR codes and per-campaign views, visitors, clicks and click-through |
| Data freshness | Every card shows its source, period and when it was last updated |
| Activity chart | Hourly (24h) or daily views and clicks in the owner's local time, with a table view |
| Live | Visitors, views and clicks in the last 30 minutes plus a live activity feed, refreshed every 15 seconds |
| Links | Clicks, unique clickers and click rate per link. Selecting a link opens its trend, sources, campaigns, countries, cities and devices |
| Traffic sources | Normalized source (Instagram, TikTok, X, QR code, Google and others) and referring domain |
| Campaigns | Incoming `utm_source`, `utm_medium` and `utm_campaign` |
| Locations | Country and city |
| Technology | Device type, browser including in-app browsers (Instagram, TikTok, Facebook), operating system |
| When people visit | Weekday by hour heatmap of views |
| Insights | Rule-based findings (period change, source concentration, best time, link ordering, idle links, returning share, new members) plus an AI summary written from totals. Free for every creator |
| Campaign links and QR codes | Builds tagged links per placement and downloadable QR codes that report as the "QR code" source |
| Export | Event-level CSV for any range, including event, session and campaign IDs. Visitor and account identifiers are excluded |
| How-to guides | Collapsible step-by-step guides on the campaign, pixel and privacy sections, and "Where do I find this?" guides for each pixel ID |
| Ad and analytics pixels | Creator adds a GA4 Measurement ID, Meta Pixel ID and TikTok Pixel ID, plus optional Meta Conversions API and TikTok Events API tokens for server-side events. Loads only after visitor consent |

Ranges: 24 hours, 7, 28, 90 and 365 days, and all time. No history limit.

## Competitive position (September 2026)

| Capability | Linktree | Beacons | Stan | Later | Bio.link | Amped Bio |
| --- | --- | --- | --- | --- | --- | --- |
| Views, clicks, click rate | Free | Free | Paid | Free | Free | Free |
| History | 28d Free, 365d Pro, lifetime Premium | Lifetime | Custom | 3 to 24 months | All time | All time |
| Traffic sources and referrers | Pro | Free | Paid | Not documented | Free | Free |
| Country and city | Pro | Not documented | Not documented | Free | Free | Free |
| Device | Pro | Not documented | Not documented | No | No | Free |
| Browser, OS, in-app browser | No | No | No | No | No | Free |
| Incoming UTM campaign reporting | No | Not documented | No | No | Not documented | Free |
| Time on page | No | No | No | No | No | Free |
| Traffic heatmap by hour | No (posting times only) | No | No | No | No | Free |
| Change vs previous period | Not documented | Partial | Not documented | No | No | Free |
| Real-time | 30 min delay | Advertised | Not documented | Daily for location | Not documented | Live, 15s refresh |
| QR scan attribution | Unclear | No | No | No | No | Free |
| CSV export | Premium only | Paid | Not documented | Free | Not documented | Free, event level |
| AI insights | Pro (beta chat) | Free assistant | No | No | No | Rule-based free, AI summary optional |
| Google Analytics 4 | Pro | Not documented | Pro | UTMs only | Not documented | Free |
| Meta Pixel and Conversions API | Pro | Paid | Pro | No | Not documented | Free |
| TikTok Pixel | Not offered | Paid | Pro | No | Not documented | Free, with Events API |
| Visitor consent banner for pixels | Not documented | Not documented | Not documented | No | Not documented | Built in, honors Global Privacy Control |

Sources: Linktree help center articles 5434178, 5434172 and 5434140; help.beacons.ai; help.stan.store;
help.later.com article 360042743234; help.bio.link article 5291287; Linktree help articles 5434201
(Google Analytics) and 5434194 (Meta Pixel); Linktree TikTok integrations marketplace page.

Not yet at parity: revenue analytics and subscriber or email capture metrics. These depend on
features Amped Bio does not have yet.

## Privacy model

Every visitor, without cookies or consent:

- Nothing is stored in the browser.
- Raw IP addresses are never stored. The server derives a visitor hash from a daily rotating salt,
  the page owner id, IP address and user agent, then discards the inputs. Visitors cannot be linked
  across days or across creator pages.
- Unique visitors are counted per day and summed across the range.
- Stored location is limited to country code and city name.
- Page owners viewing their own page while signed in are excluded.
- Known bots and crawlers are dropped. Each IP is limited to 60 events per minute.
- Every event carries a client-generated UUID (`event_id`, unique in the database), so retried
  deliveries are stored once.
- Each page load gets an in-memory session ID.

Visitors who allow "Return visits" (analytics consent):

- A random ID (`amped_vid`) is kept in local storage for up to 13 months. The server stores only a
  keyed hash of it, scoped per creator (`persistent_visitor`), so visitors cannot be linked across
  creators. Withdrawing consent deletes it immediately.
- The session ID persists for the browser tab (`amped_sid`).
- If the visitor is signed in to Amped Bio, the server records their account (`visitor_user_id`),
  read from the login cookie and never from the request body. Creators never see it; it is excluded
  from exports.
- Returning visitors and retention are computed only from this group, and the dashboard shows the
  coverage (share of visitors who opted in).

Consent mechanics:

- One banner on every creator page with Accept all, Reject all and Choose, equal prominence.
- Two categories: Return visits (site-wide) and Ads and analytics by the creator (per creator,
  only shown when the creator connected a pixel).
- Choices are stored for 13 months and re-asked when `CONSENT_POLICY_VERSION` changes. A Privacy
  choices link on every page reopens the settings.
- Each decision is recorded in `analytics_consents` (choice, policy version, source, time, daily
  visitor hash) as proof of consent. No IP address.
- Draft notice text and creator terms for counsel: `docs/legal/`.

The optional AI summary sends only aggregate totals to the model provider. No visitor-level data
leaves the server.

Location fallback uses GeoLite2 data created by MaxMind (via `fast-geoip`), which requires
attribution. The attribution appears in the dashboard footer.

Creator pixels (GA4, Meta, TikTok):

- Nothing loads until the visitor accepts a banner that names the creator and each service.
  Accept and Decline have equal weight. Declining changes nothing else on the page.
- Consent is recorded per creator in the visitor's browser storage and can be changed from a
  "Tracking choices" link on the page.
- Browsers that send a Global Privacy Control signal are treated as declined and see no banner.
- Server-side events (Meta Conversions API, TikTok Events API) are sent only for consented events.
  They include the visitor's IP address and user agent, as those APIs require. Amped Bio still
  does not store the IP.
- Meta and TikTok tokens are encrypted at rest (AES-256-GCM) and never returned to any client.
- The creator is told in the dashboard that they are responsible for their use of pixel data.

Open item outside this feature: the public site layout loads Amped Bio's own Google Analytics
property (`G-SK6H61G3S1`) on every page, including creator pages, before any consent. That tag
sets cookies. It should move behind the same consent mechanism or Google Consent Mode before
promoting to EU and UK visitors.

Counsel should confirm the banner text, the creator terms update (creator as controller for pixel
data) and the EU ePrivacy and GDPR analysis before launch.

## Architecture

```
Public profile (apps/landingpage)            API (apps/server)                     Dashboard (apps/client)
lib/analytics.ts                             POST /api/analytics/collect            panels/analytics/*
  view on load            -- sendBeacon -->    zod validate, bot filter,            trpc.analytics.dashboard
  click on link button                         rate limit, ownership check,         trpc.analytics.breakdown
  engage on page hide                          geo, UA parse, visitor hash          trpc.analytics.linkDetail
                                               -> analytics_events (MySQL)          trpc.analytics.realtime
                                                                                    trpc.analytics.exportCsv
                                                                                    trpc.analytics.aiSummary
```

- Events are sent as `text/plain` JSON so browsers treat them as simple requests (no preflight) and
  `navigator.sendBeacon` can deliver them while the page unloads.
- Click events also increment the existing `blocks.clicks` counter, so the admin dashboard keeps
  working. The legacy `blocks.registerClick` mutation is unchanged and still used by the editor
  preview.
- Aggregations run directly on `analytics_events` with composite indexes on
  `(user_id, created_at)` and `(user_id, type, created_at)`. When volume grows, add a daily rollup
  table and move ranges longer than 90 days to it.

## Configuration

| Variable | App | Purpose |
| --- | --- | --- |
| `ANALYTICS_SALT_SECRET` | server | Secret mixed into the daily visitor hash. Falls back to `BETTER_AUTH_SECRET` |
| `ANTHROPIC_API_KEY` | server | Required for the AI summary, which is on for every creator. Without it the Insights card shows rule-based findings only |
| `ANTHROPIC_MODEL` | server | Optional. Defaults to `claude-haiku-4-5-20251001` |
| `TRACKING_TOKEN_SECRET` | server | Encrypts creators' Meta and TikTok tokens. Falls back to `BETTER_AUTH_SECRET`. Rotating it makes stored tokens unreadable |
| `META_GRAPH_API_VERSION` | server | Optional. Defaults to `v24.0` (supported by Meta until February 2028) |

Location uses edge headers first (`cf-ipcountry`, `x-vercel-ip-country`, `cloudfront-viewer-country`
and the matching city headers), then the bundled GeoLite2 database.

## Deploy

1. Run `pnpm run --filter server prisma:migrate`. Three migrations: `analytics_events`,
   `tracking_pixels`, and `analytics_campaigns` / `analytics_consents` with the new event columns.
2. Deploy the server, then the landing page, then the client.
3. Set `TRACKING_TOKEN_SECRET` and `ANTHROPIC_API_KEY` on the server. Set `ANALYTICS_SALT_SECRET`
   too; changing it later breaks returning-visitor continuity.

## KPI definitions

| KPI | Definition | Source |
| --- | --- | --- |
| Views | Valid `view` events after bot and owner filtering | Page events |
| Unique visitors | Distinct daily visitor hashes with a view, summed over the period | Page events |
| Link clicks | Valid `click` events, deduplicated by event ID | Page events |
| Visitor click-through | Unique visitors who clicked ÷ unique visitors | Page events |
| Clicks per view | Link clicks ÷ views | Page events |
| Avg. time on page | Mean visible time from `engage` events over 1 second | Page events |
| New members | Referral records created in the period for this creator | Sign-ups through the page |
| Member conversion | New members ÷ unique visitors | Sign-ups and page events |
| Returning visitors | Consented visitors in the period with a view on an earlier day ÷ consented visitors | Consented page events |
| Coverage | Consented visitors ÷ unique visitors | Page events |
| Retention week N | Share of a first-visit-week cohort with a view 7N to 7N+6 days after their first visit | Consented page events |
