/**
 * In app browsers (docs/features/mobile-checkout.md 7, PR CK-4; decisions D3 and QA1).
 * Free actions stay in the webview. Buy and Join hand off to Safari or Chrome, where
 * Google sign in, Apple Pay and Google Pay work.
 */

export const IN_APP_BROWSER_APPS = [
  "instagram",
  "threads",
  "facebook",
  "tiktok",
  "x",
  "linkedin",
  "snapchat",
] as const;
export type InAppBrowserApp = (typeof IN_APP_BROWSER_APPS)[number];

export type InAppBrowser = { app: InAppBrowserApp; os: "ios" | "android" | "other" };

/** Checked in order. Threads sends "Instagram" too, so it comes first. */
const APP_PATTERNS: [InAppBrowserApp, RegExp][] = [
  ["threads", /Barcelona/],
  ["instagram", /Instagram/],
  ["facebook", /FBAN|FBAV|FB_IAB|FBIOS/],
  ["tiktok", /musical_ly|BytedanceWebview|TikTok|trill_/i],
  ["linkedin", /LinkedInApp/],
  ["snapchat", /Snapchat/],
  ["x", /Twitter/],
];

/** The app whose in app browser is showing the page, from the user agent; null otherwise. */
export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowser | null {
  if (!userAgent) return null;
  const match = APP_PATTERNS.find(([, pattern]) => pattern.test(userAgent));
  if (!match) return null;
  const os = /iPhone|iPad|iPod/.test(userAgent)
    ? "ios"
    : /Android/.test(userAgent)
      ? "android"
      : "other";
  return { app: match[0], os };
}

/**
 * Android: an intent link that opens the https URL in Chrome, with the URL itself as the
 * fallback. It carries what the URL carries and nothing else (CK-4 adds no sign in token;
 * that waits for the security review, CK-4b).
 */
export function chromeIntentUrl(httpsUrl: string): string {
  const match = /^https:\/\/([^#\s]+)$/.exec(httpsUrl);
  if (!match) throw new Error("chromeIntentUrl needs an https URL without a fragment");
  return (
    `intent://${match[1]}#Intent;scheme=https;package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`
  );
}

const APP_NAMES: Record<InAppBrowserApp, string> = {
  instagram: "Instagram",
  threads: "Threads",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
};

/**
 * The two menu steps drawn for each app on iPhone (QA1). Confirm on a real device before
 * CK-4 merges (spec 13); apps move these menus.
 */
const IOS_STEPS: Record<InAppBrowserApp, [string, string]> = {
  instagram: ["Tap ••• at the top right.", "Tap Open in external browser."],
  threads: ["Tap ••• at the top right.", "Tap Open in browser."],
  facebook: ["Tap ••• at the top right.", "Tap Open in external browser."],
  tiktok: ["Tap ••• at the top right.", "Tap Open in browser."],
  x: ["Tap ••• at the top right.", "Tap Open in Safari."],
  linkedin: ["Tap ••• at the top right.", "Tap Open in browser."],
  snapchat: ["Tap ••• at the top right.", "Tap Open in Safari."],
};

/** Handoff card copy (board c4). No dashes. */
export const HANDOFF_COPY = {
  appName: (app: InAppBrowserApp) => APP_NAMES[app],
  title: "Open this in your browser to pay",
  body: (app: InAppBrowserApp, browser: "Safari" | "Chrome" | "your browser") =>
    `${APP_NAMES[app]} cannot finish a payment. Sign in and pay in ${browser}. Your checkout stays open for 24 hours.`,
  iosSteps: (app: InAppBrowserApp) => IOS_STEPS[app],
  orCopy: "Or copy the link and paste it into Safari.",
  openInChrome: "Open in Chrome",
  androidHelp: "If Chrome does not open, copy the link and paste it into Chrome.",
  copyLink: "Copy link",
  copied: "Link copied",
  copyFailed: "Copy did not work. Press and hold the link to copy it.",
  linkLine: "The link opens this checkout. It does not sign anyone in.",
} as const;
