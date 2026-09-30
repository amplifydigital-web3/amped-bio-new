"use client";

import { useEffect } from "react";
import { getAnalyticsConsent } from "@/lib/consent";
import { CONSENT_CHANGE_EVENT, syncAmpedAnalytics } from "@/lib/ampedAnalytics";

/**
 * Loads Amped Bio's Google Analytics only for visitors who allowed analytics,
 * and follows later changes made in the consent banner.
 */
export function AmpedAnalytics() {
  useEffect(() => {
    const sync = () => syncAmpedAnalytics(getAnalyticsConsent() === true);
    sync();
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
  }, []);

  return null;
}
