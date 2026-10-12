import { formatHandle } from "@/lib/handle";

/**
 * Build the apps/client URL for editing a user's page. All edit and private
 * areas live in the client app, so links from the public site must point there.
 */
export function getPanelEditUrl(handle: string): string {
  const base = process.env.NEXT_PUBLIC_PANEL_URL || "";
  if (!handle) return base || "/";
  return `${base}/${formatHandle(handle)}/edit`;
}

/**
 * The editor Home in apps/client. New accounts pass welcome so Home opens the
 * setup checklist (Screen Review 008 I14, 010 I03).
 */
export function getPanelHomeUrl(options: { welcome?: boolean } = {}): string {
  const base = process.env.NEXT_PUBLIC_PANEL_URL || "";
  return `${base}/home${options.welcome ? "?welcome=1" : ""}`;
}

/**
 * Build the apps/client URL that opens a pool's details panel in Explore, where the
 * signed in person can stake (D27, Screen Review 071 I03). The client reads
 * ?pool=<address> and opens the pool panel; legacy ?pa= is rewritten there.
 * /i/pools/... must never be used on the panel host: the client has no such
 * route and bounces it back to the public site.
 */
export function getPanelPoolUrl(poolAddress: string): string {
  const base = process.env.NEXT_PUBLIC_PANEL_URL || "";
  return `${base}/explore?pool=${encodeURIComponent(poolAddress)}`;
}

/**
 * Validates a ?redirect= value before navigating to it after sign in.
 * Allowed: a same site URL or an absolute URL on the panel or admin origin. The value is parsed
 * before origins are compared, because URL parsers strip tabs and newlines, so a raw
 * string check on "/" can be bypassed ("/\t/evil.com" resolves to https://evil.com/).
 * Anything else returns null so callers fall back to their default destination.
 */
export function getSafeRedirect(raw: string | null | undefined): string | null {
  if (!raw || typeof window === "undefined") return null;
  try {
    const target = new URL(raw, window.location.origin);
    const allowed = [window.location.origin];
    const panel = process.env.NEXT_PUBLIC_PANEL_URL;
    if (panel) allowed.push(new URL(panel).origin);
    // Screen Review 081 I05, I10: the admin app sends signed out admins here too
    const admin = process.env.NEXT_PUBLIC_ADMIN_URL;
    if (admin) allowed.push(new URL(admin).origin);
    if (!allowed.includes(target.origin)) return null;
    // Same site targets are returned as a normalized path so router.push stays on site
    return target.origin === window.location.origin
      ? `${target.pathname}${target.search}${target.hash}`
      : target.toString();
  } catch {
    return null;
  }
}

/**
 * Where to go after sign in (Screen Review 009 I17, D27): a same origin
 * ?returnTo, or the legacy ?redirect when it points to the panel origin, else
 * the panel Home. Never an off site target.
 */
export function getPostAuthDestination(
  params: URLSearchParams,
  options: { welcome?: boolean } = {}
): string {
  return (
    getSafeRedirect(params.get("returnTo")) ||
    getSafeRedirect(params.get("redirect")) ||
    getPanelHomeUrl(options)
  );
}

/** Absolute form of a destination, for OAuth callback URLs. */
export function toAbsoluteUrl(url: string): string {
  if (typeof window === "undefined" || /^https?:\/\//i.test(url)) return url;
  return new URL(url, window.location.origin).toString();
}

/** Full navigation: destinations are often on the panel origin. */
export function goTo(url: string) {
  window.location.href = url;
}
