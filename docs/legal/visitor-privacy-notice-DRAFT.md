# DRAFT for counsel review: Visitor analytics and cookie notice

Status: draft prepared with the creator analytics feature. Not legal advice. Not published.
Intended placement: a section of the Amped Bio Privacy Policy, linked from the privacy banner on
every creator page. Policy version in code: `CONSENT_POLICY_VERSION = "2026-09"`. Changing the
notice materially requires bumping that value, which asks every visitor again.

Items in [brackets] need counsel or business input.

---

## Analytics on creator pages

When you visit a creator's page on amped.bio, Amped Bio collects information about the visit so
the creator can see how their page performs. [Amped Bio Inc. / legal entity] is the controller for
this analytics. Where a creator connects their own advertising tools, the creator is responsible
for those tools, as described below.

### What we collect on every visit (no cookies)

- The page you viewed and the links you tapped
- How long the page was visible
- The website or app that sent you, and any campaign tags in the link you followed
- Your approximate country and city, derived from your network address
- Device type, operating system and browser

We do not store your IP address. To count distinct visitors, we calculate a one-way code from
your network address, browser details, the creator's page and a secret value that changes every
day. The code cannot be reversed, and it cannot be used to recognise you on another day or on
another creator's page.

Legal basis: [legitimate interests of Amped Bio and creators in measuring page performance, to be
confirmed; confirm whether the cookieless measurement qualifies for the audience measurement
exemption in the relevant EU and UK guidance].

### Return visits (only with your permission)

If you choose **Accept all**, or allow **Return visits** under **Choose**, we save a random
identifier in your browser's local storage. It lets the creator see how many visitors come back
and how that changes over time. It is stored with a code specific to each creator, so creators
cannot link your visits across different creators' pages.

If you are signed in to an Amped Bio account while you visit, and you have allowed return visits,
we also record your account with the visit. Creators do not see which account visited. [Confirm:
creators see only aggregate numbers; exports exclude account and visitor identifiers.]

We keep the browser identifier for up to 13 months. Withdrawing your permission deletes it from
your browser immediately.

Legal basis: consent.

### Ads and analytics by the creator (only with your permission)

Some creators connect Google Analytics, Meta (Facebook and Instagram) or TikTok to their page. The
banner names the services a creator uses. These services load only if you choose **Accept all**
or allow **Ads and analytics by [creator]**. They set their own cookies and receive your IP
address and device information, and may use it under their own privacy policies:

- Google: [link]
- Meta: [link]
- TikTok: [link]

If the creator also connected server-side tools (Meta Conversions API or TikTok Events API), we
send the same page view or link click from our servers, including your IP address and browser
details, only if you allowed ads and analytics for that creator.

If your browser sends a Global Privacy Control signal, we treat it as a refusal of ads and
analytics by creators and do not ask.

Legal basis: consent. [Confirm roles: creator as controller, Amped Bio as processor for the
server-side transfer, or joint controllership for the browser tags.]

### Your choices

- The banner offers **Accept all**, **Reject all** and **Choose** with equal prominence.
- You can change your choices at any time from the **Privacy choices** link at the bottom of any
  creator page.
- Your choices are saved in your browser for up to 13 months, then we ask again.
- We keep a record of each choice (what was chosen, when, and the notice version) to show that we
  asked. The record does not contain your IP address.

### Retention

- Visit events: [propose 25 months, then deleted or aggregated]
- Consent records: [propose 5 years or as required]
- Browser identifier: up to 13 months, or until withdrawn

### Storage on your device

| Name | Where | Purpose | Set when | Lifetime |
| --- | --- | --- | --- | --- |
| `amped_consent_v2` | Local storage | Remembers your privacy choices | You make a choice | 13 months |
| `amped_vid` | Local storage | Random ID for return visits | You allow return visits | 13 months or until withdrawn |
| `amped_sid` | Session storage | Groups events in one browsing session | You allow return visits | Until the tab closes |
| Referral cookie | Cookie | Credits the creator if you sign up from their page | You tap "Claim your own Amped.Bio" | 30 days |
| Google, Meta, TikTok cookies | Cookies | Set by the creator's tools | You allow ads and analytics for that creator | Set by each provider |

Open item: the public site also loads Amped Bio's own Google Analytics on every page before any
choice is made. This notice assumes that tag will move behind the same banner before launch.
