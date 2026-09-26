/**
 * Integration tests for OAuth endpoints — well-known, JWKS, discovery, CORS.
 *
 * These tests hit the production/staging auth subdomain to verify the metadata
 * shapes are correct. They do not need a database because the endpoints they
 * call (metadata, JWKS, redirects) are static.
 */
import { describe, it, expect, beforeAll } from "vitest";

// URLs for testing — set via env or fall back to staging
// OAuth endpoints now live on the auth subdomain
const AUTH_URL = process.env.TEST_AUTH_URL || "https://auth.staging.amped.bio";

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
    const res = await fetch(`${AUTH_URL}/.well-known/openid-configuration`, {
      redirect: "follow",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("json");

    oidcDoc = (await res.json()) as OidcDocument;
    expect(oidcDoc.issuer).toBeDefined();
    expect(oidcDoc.issuer).not.toContain("/auth");
    expect(oidcDoc.authorization_endpoint).toMatch(/\/oauth2\/authorize$/);
    expect(oidcDoc.token_endpoint).toMatch(/\/oauth2\/token$/);
    expect(oidcDoc.jwks_uri).toMatch(/\/jwks$/);
    expect(oidcDoc.userinfo_endpoint).toMatch(/\/oauth2\/userinfo$/);
  });

  it("issuer is the auth subdomain (no /auth path)", () => {
    expect(oidcDoc.issuer).toMatch(/^https:\/\/auth\./);
    expect(oidcDoc.issuer).not.toContain("/auth");
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
    const res = await fetch(`${AUTH_URL}/.well-known/jwks.json`);
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

  it("GET /jwks returns the same key set", async () => {
    const [res1, res2] = await Promise.all([
      fetch(`${AUTH_URL}/.well-known/jwks.json`),
      fetch(`${AUTH_URL}/jwks`),
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
  it("GET /.well-known/oauth-authorization-server returns AS metadata on auth subdomain", async () => {
    const res = await fetch(`${AUTH_URL}/.well-known/oauth-authorization-server`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issuer).toBeDefined();
    expect(body.issuer).not.toContain("/auth");
    expect(body.authorization_endpoint).toMatch(/\/oauth2\/authorize$/);
  });
});

describe("OAuth login/consent/device page redirects", () => {
  it.each([
    ["/oauth/login", "/oauth/login"],
    ["/oauth/consent", "/oauth/consent"],
    ["/oauth/device", "/oauth/device"],
  ])("GET %s redirects to landing page %s", async (authPath, landingPath) => {
    const res = await fetch(`${AUTH_URL}${authPath}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain(landingPath);
  });

  it("preserves query string through the redirect", async () => {
    const res = await fetch(`${AUTH_URL}/oauth/login?client_id=test&scope=openid`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    const location = res.headers.get("location") || "";
    expect(location).toContain("client_id=test");
    expect(location).toContain("scope=openid");
  });
});

describe("OAuth CORS headers (auth subdomain)", () => {
  it.each([
    { path: "/oauth2/token", method: "POST" },
    { path: "/oauth2/userinfo", method: "GET" },
    { path: "/oauth2/introspect", method: "POST" },
    { path: "/oauth2/revoke", method: "POST" },
    { path: "/oauth2/register", method: "POST" },
    { path: "/device/code", method: "POST" },
  ])("OPTIONS $path returns CORS headers with wildcard for unknown origins", async ({ path, method }) => {
    const res = await fetch(`${AUTH_URL}${path}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://unknown-origin.example.com",
        "access-control-request-method": method,
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("OPTIONS /oauth2/authorize does NOT expose CORS to unknown origins", async () => {
    const res = await fetch(`${AUTH_URL}/oauth2/authorize`, {
      method: "OPTIONS",
      headers: {
        origin: "https://unknown-origin.example.com",
        "access-control-request-method": "GET",
      },
    });
    const acao = res.headers.get("access-control-allow-origin");
    expect(acao).not.toBe("*");
  });
});