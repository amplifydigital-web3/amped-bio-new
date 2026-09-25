import {
  CONSENT_POLICY_VERSION,
  type AnalyticsAdContext,
  type AnalyticsCollectPayload,
} from "@repo/constants";
import { getAnalyticsConsent, getPersistentVisitorId, getSessionId, newEventId } from "./consent";

/**
 * First-party page analytics for public profile pages.
 *
 * Events are sent as text/plain JSON so the browser treats them as simple
 * requests (no CORS preflight) and navigator.sendBeacon can deliver them
 * while the page is unloading. Every event carries a unique ID, so a retried
 * delivery is stored once.
 *
 * Without the visitor's analytics consent nothing is stored in the browser.
 * With it, a random long-lived ID enables returning-visitor reporting.
 */

const COLLECT_URL = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/analytics/collect`;

function send(payload: AnalyticsCollectPayload) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "text/plain" });
      if (navigator.sendBeacon(COLLECT_URL, blob)) return;
    }
  } catch {
    // Fall through to fetch
  }

  fetch(COLLECT_URL, {
    method: "POST",
    body,
    keepalive: true,
    // Lets the API recognise a signed-in Amped account, used only with consent
    credentials: "include",
    headers: { "Content-Type": "text/plain" },
  }).catch(() => undefined);
}

function context() {
  return {
    referrer: document.referrer || undefined,
    url: window.location.href,
  };
}

// Consent and identifiers are read at send time, so a choice made on the page
// applies to the next event
function identity(userId: number) {
  const analyticsConsent = getAnalyticsConsent() === true;
  return {
    userId,
    eventId: newEventId(),
    sessionId: getSessionId(),
    pvid: analyticsConsent ? (getPersistentVisitorId() ?? undefined) : undefined,
    analyticsConsent,
  };
}

export function trackProfileView(userId: number, ad?: AnalyticsAdContext) {
  send({ type: "view", ...identity(userId), ...context(), ad });
}

// Forwards a page view to the owner's ad platforms after late consent,
// without counting another first-party view
export function trackConsentedPageView(userId: number, ad: AnalyticsAdContext) {
  send({ type: "view", ...identity(userId), ...context(), ad, adOnly: true });
}

export function trackLinkClick(userId: number, blockId: number, ad?: AnalyticsAdContext) {
  send({ type: "click", ...identity(userId), blockId, ...context(), ad });
}

/** Records a consent decision on the server as proof of consent. */
export function recordConsent(
  userId: number,
  choice: { analytics: boolean; advertising: boolean },
  source: "banner" | "settings"
) {
  send({
    type: "consent",
    ...identity(userId),
    analytics: choice.analytics,
    advertising: choice.advertising,
    policyVersion: CONSENT_POLICY_VERSION,
    source,
  });
}

const MAX_ENGAGEMENT_MS = 30 * 60 * 1000;

/**
 * Measures visible time on the page and reports it once when the visitor
 * leaves or hides the tab. Returns a cleanup function.
 */
export function startEngagementTracking(userId: number): () => void {
  let visibleSince: number | null = document.visibilityState === "visible" ? Date.now() : null;
  let accumulated = 0;
  let reported = false;

  const pause = () => {
    if (visibleSince !== null) {
      accumulated += Date.now() - visibleSince;
      visibleSince = null;
    }
  };

  const report = () => {
    pause();
    if (reported || accumulated < 1000) return;
    reported = true;
    send({
      type: "engage",
      ...identity(userId),
      durationMs: Math.min(Math.round(accumulated), MAX_ENGAGEMENT_MS),
    });
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      report();
    } else if (!reported) {
      visibleSince = Date.now();
    }
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", report);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", report);
  };
}
