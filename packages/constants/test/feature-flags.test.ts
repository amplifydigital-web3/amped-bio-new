import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  PUBLIC_FEATURE_FLAG_KEYS,
  featureFlagSettingKey,
  isFeatureFlagKey,
  resolveFeatureFlag,
} from "../src/feature-flags";

describe("resolveFeatureFlag", () => {
  it("prefers the admin's row over the environment", () => {
    expect(resolveFeatureFlag("rns", { rns: false }, "true")).toBe(false);
    expect(resolveFeatureFlag("rns", { rns: true }, "false")).toBe(true);
  });

  it("falls back to the environment value when there is no row", () => {
    expect(resolveFeatureFlag("rns", {}, "true")).toBe(true);
    expect(resolveFeatureFlag("rns", {}, "false")).toBe(false);
    expect(resolveFeatureFlag("usdc", {}, true)).toBe(true);
  });

  it("uses the default when neither is set", () => {
    expect(resolveFeatureFlag("rns", {}, undefined)).toBe(FEATURE_FLAGS.rns.default);
    expect(resolveFeatureFlag("rnsExpiryEmails", {}, "")).toBe(true);
  });
});

describe("feature flag registry", () => {
  it("names every flag's row under one prefix", () => {
    expect(featureFlagSettingKey("checkout")).toBe("feature_flag.checkout");
  });

  it("knows its own keys only", () => {
    expect(isFeatureFlagKey("checkout")).toBe(true);
    expect(isFeatureFlagKey("toString")).toBe(false);
    expect(isFeatureFlagKey("nope")).toBe(false);
  });

  it("gives every public flag an app or server fallback and every server flag a server fallback", () => {
    for (const key of FEATURE_FLAG_KEYS) {
      const env = FEATURE_FLAGS[key].env as { server?: string; client?: string; landing?: string };
      // A brand new flag has no variable to migrate (AGENTS.md, feature flags step 1):
      // env is {} and it resolves from the admin's row, then its default.
      if (Object.keys(env).length === 0) {
        expect(FEATURE_FLAGS[key].default).toBe(false);
        continue;
      }
      // A public flag with only a server variable (accessGating) reaches the apps through the API
      if (PUBLIC_FEATURE_FLAG_KEYS.includes(key))
        expect(env.client || env.landing || env.server).toBeTruthy();
      else expect(env.server).toBeTruthy();
    }
  });
});
