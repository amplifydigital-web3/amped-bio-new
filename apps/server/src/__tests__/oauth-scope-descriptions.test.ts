/**
 * Tests for the shared OAuth scope descriptions used by the consent screen.
 */
import { describe, it, expect } from "vitest";
import {
  OAUTH_SCOPE_DESCRIPTIONS,
  describeOAuthScope,
} from "../../../packages/ui/src/oauth/oauth-scopes";

describe("OAUTH_SCOPE_DESCRIPTIONS", () => {
  it("describes openid scope", () => {
    const desc = OAUTH_SCOPE_DESCRIPTIONS.openid;
    expect(desc.title).toBe("Confirm your identity");
    expect(desc.description).toContain("account");
  });

  it("describes profile scope", () => {
    const desc = OAUTH_SCOPE_DESCRIPTIONS.profile;
    expect(desc.title).toContain("profile");
    expect(desc.description).toContain("name");
  });

  it("describes email scope", () => {
    const desc = OAUTH_SCOPE_DESCRIPTIONS.email;
    expect(desc.title).toContain("email");
    expect(desc.description).toContain("email");
  });

  it("describes offline_access scope", () => {
    const desc = OAUTH_SCOPE_DESCRIPTIONS.offline_access;
    expect(desc.title).toContain("Stay signed in");
    expect(desc.description).toContain("refresh");
  });

  it("describes mcp:read scope", () => {
    const desc = OAUTH_SCOPE_DESCRIPTIONS["mcp:read"];
    expect(desc.title).toContain("MCP");
    expect(desc.description).toContain("MCP");
  });

  it("covers every scope the server declares", () => {
    // These are the scopes from apps/server/src/utils/auth.ts
    const serverScopes = ["openid", "profile", "email", "offline_access", "mcp:read"] as const;
    for (const scope of serverScopes) {
      expect(OAUTH_SCOPE_DESCRIPTIONS[scope]).toBeDefined();
    }
  });
});

describe("describeOAuthScope", () => {
  it("returns the known description for a standard scope", () => {
    const result = describeOAuthScope("openid");
    expect(result).toEqual(OAUTH_SCOPE_DESCRIPTIONS.openid);
  });

  it("falls back to a generic description for unknown scopes", () => {
    const result = describeOAuthScope("custom:scope");
    expect(result.title).toBe("custom:scope");
    expect(result.description).toBe("Custom permission requested by this application.");
  });

  it("handles empty string gracefully", () => {
    const result = describeOAuthScope("");
    expect(result.title).toBe("");
  });
});