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
    description: "Your name, handle and profile picture.",
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

export function describeOAuthScope(scope: string): OAuthScopeDescription {
  const known = OAUTH_SCOPE_DESCRIPTIONS[scope as OAuthScopeKey];
  if (known) return known;

  return {
    title: scope,
    description: "Custom permission requested by this application.",
  };
}
