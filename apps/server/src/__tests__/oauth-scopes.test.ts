/**
 * Tests for OAuth scope descriptions and constants
 */
import { describe, it, expect } from "vitest";
import { OAUTH_SCOPES, IDENTITY_SCOPES, OAUTH_ACCESS_TOKEN_TTL_SECONDS, OAUTH_ISSUER, AUTH_BASE_URL } from "../utils/auth";

describe("OAuth scopes and constants", () => {
  describe("OAUTH_SCOPES", () => {
    it("includes all required scopes", () => {
      expect(OAUTH_SCOPES).toContain("openid");
      expect(OAUTH_SCOPES).toContain("profile");
      expect(OAUTH_SCOPES).toContain("email");
      expect(OAUTH_SCOPES).toContain("offline_access");
      expect(OAUTH_SCOPES).toContain("mcp:read");
    });

    it("has openid as the first scope", () => {
      expect(OAUTH_SCOPES[0]).toBe("openid");
    });

    it("has exactly 5 scopes", () => {
      expect(OAUTH_SCOPES.length).toBe(5);
    });
  });

  describe("IDENTITY_SCOPES", () => {
    it("includes identity scopes without mcp:read", () => {
      expect(IDENTITY_SCOPES).toEqual(["openid", "profile", "email", "offline_access"]);
    });

    it("does not include mcp:read", () => {
      expect(IDENTITY_SCOPES).not.toContain("mcp:read");
    });
  });

  describe("OAUTH_ACCESS_TOKEN_TTL_SECONDS", () => {
    it("is set to 15 minutes (900 seconds)", () => {
      expect(OAUTH_ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    });
  });

  describe("OAUTH_ISSUER", () => {
    it("equals the BETTER_AUTH_URL without any path suffix", () => {
      expect(OAUTH_ISSUER).toBe(AUTH_BASE_URL);
    });

    it("does NOT include the /auth path suffix", () => {
      expect(OAUTH_ISSUER).not.toContain("/auth");
    });
  });
});