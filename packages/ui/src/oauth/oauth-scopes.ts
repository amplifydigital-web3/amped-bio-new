// Human readable copy for every OAuth scope this server can grant, used by the
// consent screen so users can tell what an application is asking for.
export type OAuthScopeKey = "openid" | "profile" | "email" | "offline_access" | "mcp:read";

interface OAuthScopeDescription {
  title: string;
  description: string;
}

export const OAUTH_SCOPE_DESCRIPTIONS: Record<OAuthScopeKey, OAuthScopeDescription> = {
  openid: {
    title: "Confirm your identity",
    description: "Know which Amped.bio account is signed in.",
  },
  profile: {
    title: "See your basic profile",
    description: "Your display name, profile picture and wallet address.",
  },
  email: {
    title: "See your email address",
    description: "Your email address and whether it is verified.",
  },
  offline_access: {
    title: "Stay signed in",
    description: "Keep access after you close the browser, until you revoke it.",
  },
  "mcp:read": {
    title: "Read data through MCP",
    description: "Read your Amped.bio data from an MCP compatible client.",
  },
};

/**
 * Whether this authorization request will share the user's wallet address.
 * The server returns the wallet claim when the client requests it as a claim
 * (OIDC `claims` parameter, userinfo or id_token) or holds the profile scope
 * (apps/server/src/utils/auth.ts, customUserInfoClaims).
 */
export function consentSharesWallet(scopes: string[], claims: string | null): boolean {
  if (scopes.includes("profile")) return true;
  if (!claims) return false;
  try {
    const parsed = JSON.parse(claims) as { userinfo?: object; id_token?: object };
    return "wallet" in (parsed.userinfo ?? {}) || "wallet" in (parsed.id_token ?? {});
  } catch {
    return false;
  }
}

export function describeOAuthScope(scope: string): OAuthScopeDescription {
  const known = OAUTH_SCOPE_DESCRIPTIONS[scope as OAuthScopeKey];
  if (known) return known;

  return {
    title: scope,
    description: "Custom permission requested by this application.",
  };
}
