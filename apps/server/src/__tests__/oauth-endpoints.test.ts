/**
 * Integration tests for OAuth endpoints — well-known, JWKS, discovery, CORS.
 *
 * These tests exercise the Express app wiring without needing a real database,
 * because the endpoints they call (metadata, JWKS, redirects) are static.
 */
import { describe, it, expect, beforeAll } from "vitest";

// We use a lightweight approach: fetch the production/staging endpoints
// to verify the metadata shapes. For local testing we import the app.

// URLs for testing — set via env or fall back to staging
const API_URL = process.env.TEST_API_URL || "https://api.staging.amped.bio";

interface OidcDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  grant_types_supported?: string[];
  response_types_supported?: string[];
  [key: string]: unknown;
}

describe("OAuth well-known endpoints (live)", () => {
  let oidcDoc: OidcDocument;

  it("GET /.well-known/openid-configuration returns OIDC discovery document", async () => {
    const res = await fetch(`${API_URL}/.well-known/openid-configuration`, {
      redirect: "follow",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("json");

    oidcDoc = (await res.json()) as OidcDocument;
    expect(oidcDoc.issuer).toBeDefined();
    expect(oidcDoc.issuer).toContain("/auth");
    expect(oidcDoc.authorization_endpoint).toMatch(/\/oauth2\/authorize$/);
    expect(oidcDoc.token_endpoint).toMatch(/\/oauth2\/token$/);
    expect(oidcDoc.jwks_uri).toMatch(/\/jwks$/);
    expect(oidcDoc.userinfo_endpoint).toMatch(/\/oauth2\/userinfo$/);
  });

  it("issuer matches BETTER_AUTH_URL/auth", () => {
    expect(oidcDoc.issuer).toMatch(/^https:\/\/.+\/auth$/);
  });

  it("lists supported scopes", () => {
    expect(oidcDoc.scopes_supported).toBeDefined();
    expect(oidcDoc.scopes_supported).toContain("openid");
    expect(oidcDoc.scopes_supported).toContain("profile");
    expect(oidcDoc.scopes_supported).toContain("email");
    expect(oidcDoc.scopes_supported).toContain("offline_access");
  });

  it("lists supported grant types", () => {
    expect(oidcDoc.grant_types_supported).toBeDefined();
    expect(oidcDoc.grant_types_supported).toContain("authorization_code");
    expect(oidcDoc.grant_types_supported).toContain("refresh_token");
    expect(oidcDoc.grant_types_supported).toContain("client_credentials");
  });

  it("lists supported response types", () => {
    expect(oidcDoc.response_types_supported).toBeDefined();
    expect(oidcDoc.response_types_supported).toContain("code");
  });
});

describe("JWKS endpoint", () => {
  it("GET /.well-known/jwks.json returns a valid JWK Set", async () => {
    const res = await fetch(`${API_URL}/.well-known/jwks.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("json");

    const body = await res.json();
    expect(body.keys).toBeDefined();
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBeGreaterThanOrEqual(1);

    const key = body.keys[0];
    expect(key.kty).toBe("RSA");
    expect(key.alg).toBe("RS256");
    expect(key.use).toBe("sig");
    expect(key.kid).toBeDefined();
    expect(typeof key.kid).toBe("string");
    expect(key.n).toBeDefined(); // RSA modulus
    expect(key.e).toBeDefined(); // RSA exponent
  });

  it("GET /auth/jwks returns the same key set", async () => {
    const [res1, res2] = await Promise.all([
      fetch(`${API_URL}/.well-known/jwks.json`),
      fetch(`${API_URL}/auth/jwks`),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.keys[0].kid).toBe(body2.keys[0].kid);
    expect(body1.keys[0].n).toBe(body2.keys[0].n);
  });
});

describe("OAuth authorization server metadata", () => {
  it("GET /.well-known/oauth-authorization-server/auth returns AS metadata", async () => {
    const res = await fetch(`${API_URL}/.well-known/oauth-authorization-server/auth`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issuer).toBeDefined();
    expect(body.authorization_endpoint).toMatch(/\/oauth2\/authorize$/);
  });

  it("GET /.well-known/oauth-authorization-server redirects to issuer path", async () => {
    const res = await fetch(`${API_URL}/.well-known/oauth-authorization-server`, {
      redirect: "manual",
    });
    // Must redirect (temporary) to the issuer-rooted path
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("/auth/.well-known/oauth-authorization-server");
  });
});

describe("MCP protected resource metadata", () => {
  it("GET /.well-known/oauth-protected-resource/mcp returns RFC 9728 metadata", async () => {
    const res = await fetch(`${API_URL}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resource).toBeDefined();
    expect(body.resource).toMatch(/\/mcp$/);
    expect(body.scopes_supported).toBeDefined();
    expect(body.scopes_supported).toContain("mcp:read");
    expect(body.bearer_token_required).toBe(true);
  });

  it("GET /.well-known/oauth-protected-resource also returns metadata", async () => {
    const res = await fetch(`${API_URL}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
  });
});

describe("MCP endpoint unauthenticated challenge", () => {
  it("POST /mcp without token returns 401 with WWW-Authenticate header (RFC 9728)", async () => {
    const res = await fetch(`${API_URL}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      redirect: "manual",
    });

    // Must challenge the client
    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get("www-authenticate") || "";
    expect(wwwAuth).toContain("Bearer");
    expect(wwwAuth).toContain("scope");
  });
});

describe("OAuth login/consent/device page redirects", () => {
  it.each([
    ["/oauth/login", "/oauth/login"],
    ["/oauth/consent", "/oauth/consent"],
    ["/oauth/device", "/oauth/device"],
  ])("GET %s redirects to landing page %s", async (apiPath, landingPath) => {
    const res = await fetch(`${API_URL}${apiPath}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain(landingPath);
  });

  it("preserves query string through the redirect", async () => {
    const res = await fetch(`${API_URL}/oauth/login?client_id=test&scope=openid`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("client_id=test");
    expect(location).toContain("scope=openid");
  });
});

describe("OAuth CORS headers", () => {
  const corsOrigins = ["https://app.example.com", "http://localhost:5173"];

  it.each([
    { path: "/auth/oauth2/token", method: "POST" },
    { path: "/auth/oauth2/userinfo", method: "GET" },
    { path: "/auth/oauth2/introspect", method: "POST" },
    { path: "/auth/oauth2/revoke", method: "POST" },
    { path: "/auth/oauth2/register", method: "POST" },
    { path: "/auth/device/code", method: "POST" },
  ])("OPTIONS $path returns CORS headers with wildcard for unknown origins", async ({ path, method }) => {
    const res = await fetch(`${API_URL}${path}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://unknown-origin.example.com",
        "access-control-request-method": method,
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("OPTIONS /auth/oauth2/authorize does NOT expose CORS to unknown origins", async () => {
    const res = await fetch(`${API_URL}/auth/oauth2/authorize`, {
      method: "OPTIONS",
      headers: {
        origin: "https://unknown-origin.example.com",
        "access-control-request-method": "GET",
      },
    });
    // authorize is NOT in the permissive set; falls through to the strict cors
    // which will reject unknown origins => 500 or no ACAO header
    const acao = res.headers.get("access-control-allow-origin");
    expect(acao).not.toBe("*");
  });
});