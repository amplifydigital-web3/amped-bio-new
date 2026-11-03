"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FeatureFlagKey, FeatureFlagOverrides } from "@repo/constants";
import { resolveLandingFlag } from "@/lib/featureFlags";

const FeatureFlagsContext = createContext<FeatureFlagOverrides>({});

/** Holds the admin's rows read by the root layout (lib/featureFlags.ts) */
export function FeatureFlagsProvider({
  overrides,
  children,
}: {
  overrides: FeatureFlagOverrides;
  children: ReactNode;
}) {
  return <FeatureFlagsContext.Provider value={overrides}>{children}</FeatureFlagsContext.Provider>;
}

/** A feature flag in a client component */
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return resolveLandingFlag(key, useContext(FeatureFlagsContext));
}
