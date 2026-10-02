/**
 * Plain-language definitions shown in info bubbles. Each follows the reporting
 * spec: what is counted, where the number comes from, and known limits.
 */

export const SOURCES = {
  pageEvents: "Amped page events",
  consentedEvents: "Page events from visitors who allowed return visits",
  referrals: "Amped sign-ups through your page",
  campaigns: "Page events from your campaign links",
  rules: "Rules applied to your page events",
} as const;

export const DEFINITIONS = {
  views:
    "How many times your page was opened. Bots, link previews and your own visits while signed in are not counted.",
  visitors:
    "Different people who opened your page. Counted per day without cookies, then added up across the period, so one person visiting on 3 days counts 3 times.",
  clicks:
    "How many times visitors tapped one of your link buttons. Repeated deliveries are counted once.",
  clicksPerView:
    "Link clicks divided by views. Above 100% means visitors often tap more than one link.",
  visitorClickThrough:
    "Unique visitors who clicked at least one link, divided by unique visitors. This is the click-through rate used in the Amped reporting spec.",
  timeOnPage:
    "Average time the page was visible before the visitor left or opened a link. Only visits longer than 1 second are included.",
  newMembers:
    "People who created an Amped Bio account after coming from your page during the period.",
  memberConversion: "New members divided by unique visitors in the same period.",
  returning:
    "Visitors who allowed return-visit measurement and had also visited on an earlier day. Visitors who declined are not included in this number.",
  coverage:
    "Share of unique visitors who allowed return-visit measurement. Returning visitor and retention numbers only describe this group.",
  retention:
    "Groups visitors by the week of their first visit. Each cell shows the share of that group who visited again that many weeks later. Only visitors who allowed return-visit measurement are included.",
  activity: "Views and link clicks per day, or per hour for the last 24 hours, in your time zone.",
  live: "Visits and clicks in the last 30 minutes. Updates every 15 seconds.",
  links:
    "Clicks per link button. Unique means different visitors per day. Click rate is clicks divided by page views.",
  sources:
    "Where visitors came from. A tagged campaign link wins over the referring website, because Instagram and TikTok often hide the referring website.",
  campaigns:
    "Views and clicks from links you created below. Each campaign link carries its own ID, so results do not depend on spelling.",
  // 093 D5, approved wording
  locations:
    "Country and city estimated from the visitor's network address. Amped.Bio analytics do not store the address.",
  technology: "Device type, browser or in-app browser, and operating system of each visitor.",
  heatmap: "Views by weekday and hour in your time zone. Darker means busier.",
  // 093 D1: what the AI summary sends is stated under Write summary (AI_SUMMARY_DISCLOSURE)
  insights: "Findings from your numbers for this period.",
} as const;

// 093 D1, approved wording. Shown under Write summary before anything is sent.
export const AI_SUMMARY_DISCLOSURE =
  "To write it, Amped.Bio sends this period's and the last period's totals, top sources, devices, visitor counts and up to 10 link names to Anthropic, our AI provider. No visitor level data is sent.";

// 093 D5 and I42, approved wording, verbatim.
export const PRIVACY_FOOTER =
  "Visits are counted without cookies. Amped.Bio analytics do not store IP addresses. Pixels you connect receive them from visitors who allow ads. Return visits are measured only for visitors who opt in. Your own visits while signed in are excluded. Location data includes GeoLite2 data created by MaxMind.";

export const PRIVACY_STEPS = [
  "Amped.Bio counts every visit without cookies. Our analytics do not store visitors' IP addresses.",
  "Visitors see a privacy banner with Accept all, Reject all and Choose. Their choice is saved for up to 24 months and can be changed from the Privacy choices link on your page.",
  "Returning visitors and retention only include visitors who allowed return visits, so those numbers show their coverage.",
  "Your pixels load only for visitors who allow ads and analytics. Google, Meta and TikTok then receive the visitor's IP address and device information. Browsers that send a Global Privacy Control signal are always treated as a no.",
] as const;

// Step 5 shows only when a Meta or TikTok server token is saved (093 D5)
export const PRIVACY_STEP_SERVER_TOKEN =
  "With a server token, Amped.Bio also sends the visitor's IP address and browser details to Meta or TikTok for each consented view and click.";
