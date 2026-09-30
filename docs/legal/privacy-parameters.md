# Privacy parameters for code changes

These rules come from the published Privacy Policy (`apps/landingpage/src/content/legal/privacy.md`, served at `/privacy`) and the decisions behind it (Screen Review rows 091, 095, 30 Sep 2026). Every change that collects, stores, sends or displays personal information must follow them. If a change needs a rule to move, update the policy first and bump `CONSENT_POLICY_VERSION`.

Operator: Oneiro N.A., Inc., dba Amplify Digital, Boston, Massachusetts. Contact: privacy@amped.bio.

## Consent and analytics

- Amped's Google Analytics (`G-SK6H61G3S1`) runs on every public page and the editor, in Google Consent Mode.
- Consent defaults to denied for `analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization`, set before any Google tag runs (`CONSENT_DEFAULT_SNIPPET` in `lib/ampedAnalytics.ts`, and `apps/client/index.html`).
- Only Accept all, or Return visits allowed, grants `analytics_storage`. Amped's own ad consent types always stay denied.
- The editor has no consent card, so it stays cookieless.
- No Google Analytics on `/oauth/*`.
- Withdrawing consent denies storage and deletes `_ga_SK6H61G3S1`, and `_ga` unless a creator's GA4 is active on the page.
- A creator's own GA4, Meta and TikTok tags load only after the visitor allows that creator's tags. They share Amped's gtag queue. When the creator's tags are allowed but Amped analytics is not, set `ga-disable-G-SK6H61G3S1`.
  - This is intended: Consent Mode has one `analytics_storage` state per page, and the creator's GA4 needs it granted, so Amped's property cannot stay cookieless next to it. Amped's property sends nothing for those visitors, not even cookieless pings, until they allow Amped analytics.
- Page views: `gtag('config')` sends the first one, and GA4 enhanced measurement ("Page changes based on browser history events", on by default) sends one per client side navigation. Do not send `page_view` manually as well, or navigations are counted twice. If that setting is turned off in the property, switch to `send_page_view: false` and send every page view manually.
- Server side events to Meta Conversions API and TikTok Events API are sent only for consented events. Do not store the IP address.
- Global Privacy Control turns off creator tags.
- First party visit counting (`lib/analytics.ts` to `/api/analytics/collect`) is cookieless and stores no IP address. The daily salted visitor hash must not become reversible or cross creator.

## Lifetimes

- 24 months for all visitors, including EU and UK: the consent choice (`CONSENT_MAX_AGE_MS`), the return visit ID (`amped_vid`), and GA cookies (`cookie_expires` 63072000 seconds).
- Retention: visit events 25 months, consent records 5 years (no IP address), accounts deleted within 30 days of closing, wallet and transaction records 5 years after close, ndau conversion records 7 years, connected app records 30 days after removal, support messages 2 years.

## Rules for new code

- No new tracker, pixel, SDK or third party recipient without adding it to the policy (sections 8 and 9) first. The X (Twitter) pixel is not in use.
- Nothing is written to cookies or browser storage on public pages before a choice, except what the policy's storage table lists.
- Never send visitor level data to AI providers. Creator summaries send page totals only.
- Minimum account age is 18.
- Link the policy from new public surfaces and emails: `/privacy` on amped.bio, `new URL("/privacy", env.LANDINGPAGE_URL)` in server emails (so staging links to staging), `https://amped.bio/privacy` elsewhere.
- Copy rules: no income, yield, APY or APR. Use the standard testnet line where tREVO appears.
