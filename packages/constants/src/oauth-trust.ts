// Screen Review 094 D1. Skip consent is only for Amped.Bio first party apps:
// every redirect URI must be an https address on an Amped.Bio host. The admin
// form uses this to enable the checkbox, and the server enforces it on create
// and update, so a third party client can never sign people in without the
// consent screen.
//
// Counsel confirms the host list (094 D1 wording). Until then only amped.bio
// and its subdomains count.
export const AMPED_BIO_FIRST_PARTY_HOSTS = ["amped.bio"] as const;

export const SKIP_CONSENT_HOST_ERROR =
  "Skip consent is only for apps whose redirect addresses are on Amped.Bio.";

// https, then the host, then an optional port, then the end or a path. No
// user info (an @ in the authority) is accepted, so https://amped.bio@evil.com
// never passes. Parsed without URL so the package stays free of DOM types.
const HTTPS_AUTHORITY = /^https:\/\/([^/?#@\s]+?)(?::(\d{1,5}))?(?:[/?#]|$)/i;

/** True when the address is https on amped.bio or one of its subdomains. */
export function isAmpedBioRedirectUri(uri: string): boolean {
  const match = HTTPS_AUTHORITY.exec(uri.trim());
  if (!match?.[1]) return false;
  const host = match[1].toLowerCase().replace(/\.$/, "");
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  return AMPED_BIO_FIRST_PARTY_HOSTS.some(base => host === base || host.endsWith(`.${base}`));
}

/** Skip consent is allowed only when there is at least one URI and every URI is Amped.Bio. */
export function canSkipConsent(redirectUris: readonly string[]): boolean {
  const uris = redirectUris.map(uri => uri.trim()).filter(Boolean);
  return uris.length > 0 && uris.every(isAmpedBioRedirectUri);
}
