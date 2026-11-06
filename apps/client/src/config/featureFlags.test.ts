import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isFeatureOn,
  loadFeatureFlags,
  parseFeatureFlagOverrides,
  setFeatureFlagOverridesForTests,
} from "./featureFlags";

afterEach(() => {
  setFeatureFlagOverridesForTests({});
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("isFeatureOn", () => {
  it("falls back to the build's VITE_ variable without a row", () => {
    vi.stubEnv("VITE_SHOW_RNS", "true");
    expect(isFeatureOn("rns")).toBe(true);
    vi.stubEnv("VITE_SHOW_RNS", "false");
    expect(isFeatureOn("rns")).toBe(false);
  });

  it("lets the admin's row win over the build", () => {
    vi.stubEnv("VITE_SHOW_RNS", "true");
    setFeatureFlagOverridesForTests({ rns: false });
    expect(isFeatureOn("rns")).toBe(false);
  });
});

describe("parseFeatureFlagOverrides", () => {
  it("keeps public flags with boolean values only", () => {
    expect(
      parseFeatureFlagOverrides({
        rns: true,
        checkout: "yes",
        rnsPublicIdentity: true,
        accessGating: true,
        nope: true,
      })
    ).toEqual({ rns: true, accessGating: true });
  });
});

describe("loadFeatureFlags", () => {
  it("reads the rows from the API and keeps them for the next load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: { data: { rns: true } } })))
    );
    await loadFeatureFlags();
    expect(isFeatureOn("rns")).toBe(true);
    expect(JSON.parse(localStorage.getItem("amped_feature_flags") ?? "{}")).toEqual({ rns: true });
  });

  it("uses the last rows this browser saw when the API is down", async () => {
    localStorage.setItem("amped_feature_flags", JSON.stringify({ wallet: true }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down")))
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadFeatureFlags();
    expect(isFeatureOn("wallet")).toBe(true);
  });
});
