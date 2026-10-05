"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getAnalyticsConsent } from "@/lib/consent";
import { CONSENT_CHANGE_EVENT, syncAmpedAnalytics } from "@/lib/ampedAnalytics";

/**
 * Runs Amped Bio's Google Analytics in Consent Mode on every public route
 * except /oauth/*, and follows later changes made in the consent card.
 */
export function AmpedAnalytics() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    const sync = () => syncAmpedAnalytics(getAnalyticsConsent() === true, pathname);
    sync();
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
  }, [pathname]);

  return null;
}
