import { TRPCError } from "@trpc/server";
import { SKIP_CONSENT_HOST_ERROR, canSkipConsent } from "@repo/constants";

/**
 * Screen Review 094 D1: only Amped.Bio first party apps may skip the consent
 * screen. A client that skips consent must have every redirect URI on an
 * Amped.Bio host; anything else is rejected on create and update.
 */
export function assertSkipConsentAllowed(
  skipConsent: boolean | null | undefined,
  redirectUris: readonly string[]
): void {
  if (!skipConsent) return;
  if (!canSkipConsent(redirectUris)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: SKIP_CONSENT_HOST_ERROR });
  }
}
