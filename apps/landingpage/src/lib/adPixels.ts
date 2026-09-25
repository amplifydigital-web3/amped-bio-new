import {
  GA4_MEASUREMENT_ID_PATTERN,
  META_PIXEL_ID_PATTERN,
  TIKTOK_PIXEL_ID_PATTERN,
  type AnalyticsAdContext,
  type PublicTrackingPixels,
} from "@repo/constants";

/**
 * Page owner tracking pixels (Google Analytics 4, Meta Pixel, TikTok Pixel).
 *
 * Nothing in this file runs until the visitor allows advertising for this
 * specific creator (see lib/consent.ts). Browsers that send Global Privacy
 * Control are treated as declined.
 */

type PixelWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  ttq?: {
    track: (...args: unknown[]) => void;
    page: () => void;
    load: (id: string) => void;
    instance?: (id: string) => unknown;
  };
  __ampedPixelsLoaded?: Set<string>;
};

const pixelWindow = () => window as PixelWindow;

export function hasAnyPixel(pixels: PublicTrackingPixels | null | undefined): boolean {
  return !!pixels && !!(pixels.ga4MeasurementId || pixels.metaPixelId || pixels.tiktokPixelId);
}

export function pixelServiceNames(pixels: PublicTrackingPixels): string[] {
  const names: string[] = [];
  if (pixels.ga4MeasurementId) names.push("Google Analytics");
  if (pixels.metaPixelId) names.push("Meta (Facebook and Instagram)");
  if (pixels.tiktokPixelId) names.push("TikTok");
  return names;
}

function injectInlineScript(id: string, code: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.text = code;
  document.head.appendChild(script);
}

function injectExternalScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

/**
 * Loads the configured tags once. IDs are re-validated here because they are
 * interpolated into script text.
 */
export function loadPixels(pixels: PublicTrackingPixels) {
  const w = pixelWindow();
  w.__ampedPixelsLoaded ??= new Set();
  const loaded = w.__ampedPixelsLoaded;

  const ga4 = pixels.ga4MeasurementId;
  if (ga4 && GA4_MEASUREMENT_ID_PATTERN.test(ga4) && !loaded.has(`ga4:${ga4}`)) {
    loaded.add(`ga4:${ga4}`);
    injectExternalScript("amped-ga4", `https://www.googletagmanager.com/gtag/js?id=${ga4}`);
    // Reuse gtag when the site already defined it, so both properties share one queue
    if (!w.gtag) {
      w.dataLayer = w.dataLayer || [];
      w.gtag = function gtag() {
        // gtag must push the arguments object itself
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments);
      };
      w.gtag("js", new Date());
    }
    w.gtag("config", ga4);
  }

  const meta = pixels.metaPixelId;
  if (meta && META_PIXEL_ID_PATTERN.test(meta) && !loaded.has(`meta:${meta}`)) {
    loaded.add(`meta:${meta}`);
    injectInlineScript(
      "amped-meta-pixel",
      `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');`
    );
    w.fbq?.("init", meta);
  }

  const tiktok = pixels.tiktokPixelId;
  if (tiktok && TIKTOK_PIXEL_ID_PATTERN.test(tiktok) && !loaded.has(`tiktok:${tiktok}`)) {
    loaded.add(`tiktok:${tiktok}`);
    injectInlineScript(
      "amped-tiktok-pixel",
      `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load("${tiktok}");ttq.page();}(window,document,"ttq");`
    );
  }
}

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Identifiers the platforms use to match server events to browser events. */
function buildAdContext(eventId: string): AnalyticsAdContext {
  const params = new URLSearchParams(window.location.search);
  const fbclid = params.get("fbclid");
  return {
    eventId,
    fbp: readCookie("_fbp"),
    fbc: readCookie("_fbc") ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined),
    ttp: readCookie("_ttp"),
    ttclid: params.get("ttclid") ?? undefined,
  };
}

/** Fires the browser-side page view and returns the context for the server copy. */
export function firePixelPageView(pixels: PublicTrackingPixels): AnalyticsAdContext {
  const w = pixelWindow();
  const eventId = newEventId();
  if (pixels.metaPixelId) w.fbq?.("track", "PageView", {}, { eventID: eventId });
  if (pixels.tiktokPixelId) w.ttq?.track("ViewContent", {}, { event_id: eventId });
  // GA4 records page_view on config, so no extra call is needed
  return buildAdContext(eventId);
}

export function firePixelLinkClick(
  pixels: PublicTrackingPixels,
  link: { label?: string; url?: string }
): AnalyticsAdContext {
  const w = pixelWindow();
  const eventId = newEventId();
  if (pixels.ga4MeasurementId) {
    // send_to keeps creator events out of any other GA property on the page
    w.gtag?.("event", "click", {
      send_to: pixels.ga4MeasurementId,
      link_text: link.label,
      link_url: link.url,
      outbound: true,
      transport_type: "beacon",
    });
  }
  if (pixels.metaPixelId) {
    w.fbq?.(
      "trackCustom",
      "LinkClick",
      { content_name: link.label, link_url: link.url },
      { eventID: eventId }
    );
  }
  if (pixels.tiktokPixelId) {
    w.ttq?.track(
      "ClickButton",
      { content_name: link.label, description: link.url },
      { event_id: eventId }
    );
  }
  return buildAdContext(eventId);
}
