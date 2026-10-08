/**
 * Screen Review 094 D1: skip consent is only for Amped.Bio first party apps
 * whose every redirect URI is an https address on an Amped.Bio host. The
 * admin createClient and updateClient procedures call
 * assertSkipConsentAllowed, so the rule holds for the API, not only the form.
 */
import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { canSkipConsent, isAmpedBioRedirectUri, SKIP_CONSENT_HOST_ERROR } from "@repo/constants";
import { assertSkipConsentAllowed } from "../trpc/admin/oauthTrust";

describe("isAmpedBioRedirectUri", () => {
  it.each([
    "https://amped.bio/oauth/callback",
    "https://app.amped.bio/callback",
    "https://app.staging.amped.bio/api/auth/callback/amped",
    "https://AMPED.BIO:443/callback",
  ])("accepts %s", uri => {
    expect(isAmpedBioRedirectUri(uri)).toBe(true);
  });

  it.each([
    "http://amped.bio/callback",
    "https://tidecircle.app/callback",
    "https://evilamped.bio/callback",
    "https://amped.bio.evil.com/callback",
    "https://amped.bio@evil.com/callback",
    "ampedbio://callback",
    "http://localhost:5173/callback",
    "not a url",
  ])("rejects %s", uri => {
    expect(isAmpedBioRedirectUri(uri)).toBe(false);
  });
});

describe("canSkipConsent", () => {
  it("needs at least one redirect URI", () => {
    expect(canSkipConsent([])).toBe(false);
  });

  it("needs every redirect URI on an Amped.Bio host", () => {
    expect(canSkipConsent(["https://amped.bio/a", "https://app.amped.bio/b"])).toBe(true);
    expect(canSkipConsent(["https://amped.bio/a", "https://tidecircle.app/b"])).toBe(false);
  });
});

describe("assertSkipConsentAllowed", () => {
  it("allows any redirect URI when skip consent is off", () => {
    expect(() => assertSkipConsentAllowed(false, ["https://tidecircle.app/cb"])).not.toThrow();
    expect(() => assertSkipConsentAllowed(null, ["https://tidecircle.app/cb"])).not.toThrow();
  });

  it("allows skip consent for Amped.Bio redirect URIs", () => {
    expect(() =>
      assertSkipConsentAllowed(true, ["https://amped.bio/oauth/callback"])
    ).not.toThrow();
  });

  it("rejects skip consent with a third party redirect URI", () => {
    try {
      assertSkipConsentAllowed(true, [
        "https://amped.bio/oauth/callback",
        "https://tidecircle.app/callback",
      ]);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("BAD_REQUEST");
      expect((error as TRPCError).message).toBe(SKIP_CONSENT_HOST_ERROR);
    }
  });
});
