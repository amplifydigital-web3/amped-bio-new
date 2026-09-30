/**
 * Amped Bio's own Google Analytics property, in Google Consent Mode.
 *
 * Privacy parameters (docs/legal/privacy-parameters.md, 095 D1):
 * - GA runs on every public page except Sign in with Amped.Bio (/oauth/*).
 * - Consent defaults to denied before any Google tag runs, so until the
 *   visitor chooses, GA sends cookieless measurements only.
 * - Accept all, or Return visits allowed, grants analytics_storage. Amped's
 *   own ad_storage, ad_user_data and ad_personalization always stay denied.
 * - GA cookies last 24 months (GA_COOKIE_EXPIRES_SECONDS). Withdrawing
 *   consent denies storage again and deletes the cookies.
 * - The creator's own GA4 (lib/adPixels.ts) shares this gtag queue. When the
 *   visitor allowed the creator's tags but not Amped analytics, Amped's
 *   property is disabled for the page view so it never uses those cookies.
 */

export const AMPED_GA_ID = "G-SK6H61G3S1";

/** 24 months, the GA default, matching CONSENT_MAX_AGE_MS. */
export const GA_COOKIE_EXPIRES_SECONDS = 730 * 24 * 60 * 60;

/** Fired on window by saveConsent so page-level listeners can react. */
export const CONSENT_CHANGE_EVENT = "amped:consent-change";

/** Routes where Amped's GA never loads (row 091 D2). */
export function isGaExcludedPath(pathname: string): boolean {
  return pathname === "/oauth" || pathname.startsWith("/oauth/");
}

type GaWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  __ampedConsentDefaultSet?: boolean;
  __ampedCreatorGaActive?: boolean;
  __ampedLastPath?: string;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

const SCRIPT_ID = "amped-site-ga4";
const gaWindow = () => window as unknown as GaWindow;

/**
 * Inline script for the root layout, run before any other script. It defines
 * gtag and sets every consent type to denied.
 */
export const CONSENT_DEFAULT_SNIPPET = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=window.gtag||gtag;gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});window.__ampedConsentDefaultSet=true;`;

/** Defines gtag and the denied consent default if the layout snippet did not run. */
export function ensureGtag() {
  const w = gaWindow();
  if (!w.gtag) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // gtag must push the arguments object itself
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  }
  if (!w.__ampedConsentDefaultSet) {
    w.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    w.__ampedConsentDefaultSet = true;
  }
  return w.gtag;
}

function deleteCookies(names: string[]) {
  if (names.length === 0) return;
  // GA sets its cookies on the widest domain it can, so clear every level
  const parts = window.location.hostname.split(".");
  const domains = parts.map((_, index) => parts.slice(index).join("."));
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${domain}`;
    }
  }
}

function deleteAmpedGaCookies() {
  const w = gaWindow();
  const own = `_ga_${AMPED_GA_ID.replace(/^G-/, "")}`;
  const names = document.cookie
    .split("; ")
    .map(pair => pair.split("=")[0])
    // _ga is shared with the creator's GA4; keep it while that tag is active
    .filter(name => name === own || (name === "_ga" && !w.__ampedCreatorGaActive));
  deleteCookies(names);
}

/**
 * Loads Amped's GA once per page view in Consent Mode and applies the
 * visitor's saved choice. Call on every public route.
 */
export function syncAmpedAnalytics(allowed: boolean, pathname: string) {
  if (typeof window === "undefined" || isGaExcludedPath(pathname)) return;
  const w = gaWindow();
  const gtag = ensureGtag();

  if (allowed) {
    w[`ga-disable-${AMPED_GA_ID}`] = false;
    gtag("consent", "update", { analytics_storage: "granted" });
  } else {
    // A creator's GA4 may still hold storage; Amped's property must not use it
    if (w.__ampedCreatorGaActive) {
      w[`ga-disable-${AMPED_GA_ID}`] = true;
    } else {
      gtag("consent", "update", { analytics_storage: "denied" });
    }
    deleteAmpedGaCookies();
  }

  if (document.getElementById(SCRIPT_ID)) {
    // Client side navigation: count the new route once
    if (w.__ampedLastPath !== pathname) {
      w.__ampedLastPath = pathname;
      gtag("event", "page_view", { page_path: pathname, send_to: AMPED_GA_ID });
    }
    return;
  }
  w.__ampedLastPath = pathname;
  gtag("js", new Date());
  gtag("config", AMPED_GA_ID, { cookie_expires: GA_COOKIE_EXPIRES_SECONDS });

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${AMPED_GA_ID}`;
  document.head.appendChild(script);
}

/**
 * Called by lib/adPixels.ts right before the creator's GA4 is configured,
 * after the visitor allowed that creator's tags.
 */
export function grantStorageForCreatorGa(ampedAllowed: boolean) {
  if (typeof window === "undefined") return;
  const w = gaWindow();
  const gtag = ensureGtag();
  w.__ampedCreatorGaActive = true;
  if (!ampedAllowed) w[`ga-disable-${AMPED_GA_ID}`] = true;
  gtag("consent", "update", { analytics_storage: "granted" });
}
