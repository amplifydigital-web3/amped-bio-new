/**
 * Amped Bio's own Google Analytics property.
 *
 * It loads only after the visitor allowed analytics in the consent banner
 * (lib/consent.ts). Before a choice, or after "Reject all", no Google script
 * is requested and no Google cookie is set. Withdrawing consent disables the
 * property for the rest of the page view and deletes its cookies.
 */

export const AMPED_GA_ID = "G-SK6H61G3S1";

/** Fired on window by saveConsent so page-level listeners can react. */
export const CONSENT_CHANGE_EVENT = "amped:consent-change";

type GaWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

const SCRIPT_ID = "amped-site-ga4";

function deleteGaCookies() {
  const names = document.cookie
    .split("; ")
    .map(pair => pair.split("=")[0])
    .filter(name => name === "_ga" || name.startsWith("_ga_"));
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

export function syncAmpedAnalytics(allowed: boolean) {
  if (typeof window === "undefined") return;
  const w = window as unknown as GaWindow;

  if (!allowed) {
    w[`ga-disable-${AMPED_GA_ID}`] = true;
    deleteGaCookies();
    return;
  }

  w[`ga-disable-${AMPED_GA_ID}`] = false;
  if (document.getElementById(SCRIPT_ID)) return;

  // Creator pixels may already have defined gtag; share its queue
  if (!w.gtag) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // gtag must push the arguments object itself
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    w.gtag("js", new Date());
  }
  w.gtag("config", AMPED_GA_ID);

  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${AMPED_GA_ID}`;
  document.head.appendChild(script);
}
