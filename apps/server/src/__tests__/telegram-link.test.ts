/**
 * Messaging on Telegram (Build Board #2), PR 2: linking (spec 3.4, acceptance 1,
 * 3 and 17). The OIDC claims mapping, the callback's session binding and
 * outcomes, the telegram.link router, and the unlink path. The database and
 * the session are mocked. Telegram's discovery, token and JWKS endpoints are a
 * stubbed fetch that signs real RS256 ID tokens, so jose verification runs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    telegramAccount: { findUnique: fn(), upsert: fn(), update: fn(), delete: fn() },
    telegramLinkEvent: { create: fn() },
    notificationPreference: { findUnique: fn(), upsert: fn(), updateMany: fn() },
    telegramOutbox: { create: fn() },
    $transaction: fn(),
  };
});
vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));

const session = vi.hoisted(() => ({ userId: null as number | null }));
vi.mock("../utils/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () =>
        session.userId === null ? null : { user: { id: String(session.userId) } }
      ),
    },
  },
}));
vi.mock("../utils/rateLimit", () => ({
  enforceRateLimits: vi.fn(),
  hitRateLimit: vi.fn(async () => 1),
}));

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../utils/cache", () => ({
  getRedisClient: () => null,
  cache: {
    set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    delete: vi.fn(async (k: string) => store.delete(k)),
  },
}));

// Telegram's OIDC endpoints, served from a stubbed fetch. The ID token is signed
// here with a real key, so jose's signature, issuer and audience checks run for real.
const op = vi.hoisted(() => ({
  claims: {} as Record<string, unknown>,
  scope: "openid profile telegram:bot_access",
  audience: "client",
  signWithOtherKey: false,
  tokenError: false,
  tokenRequests: [] as URLSearchParams[],
}));

import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { createHash } from "node:crypto";

const keys = await generateKeyPair("RS256");
const otherKeys = await generateKeyPair("RS256");
const publicJwk = { ...(await exportJWK(keys.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

async function idToken() {
  return new SignJWT(op.claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer("https://oauth.telegram.org")
    .setAudience(op.audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(op.signWithOtherKey ? otherKeys.privateKey : keys.privateKey);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/.well-known/openid-configuration")) {
      return json({
        issuer: "https://oauth.telegram.org",
        authorization_endpoint: "https://oauth.telegram.org/auth",
        token_endpoint: "https://oauth.telegram.org/token",
        jwks_uri: "https://oauth.telegram.org/.well-known/jwks.json",
      });
    }
    if (url.endsWith("/jwks.json")) return json({ keys: [publicJwk] });
    if (url.endsWith("/token")) {
      op.tokenRequests.push(new URLSearchParams(String(init?.body ?? "")));
      if (op.tokenError) return json({ error: "invalid_grant" }, 400);
      return json({
        access_token: "a",
        token_type: "Bearer",
        id_token: await idToken(),
        scope: op.scope,
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  })
);

import { env } from "../env";
import {
  claimsToIdentity,
  pkcePair,
  resetOidcConfigForTests,
  telegramRedirectUri,
} from "../services/telegram/oidc";
import { handleTelegramOidcCallback } from "../routes/telegramOidc";
import { telegramLinkRouter } from "../trpc/telegram";

const USER = 7;
const caller = telegramLinkRouter.createCaller({ user: { sub: USER } } as never);

function account(over: Record<string, unknown> = {}) {
  return {
    id: Buffer.alloc(16),
    userId: USER,
    telegramUserId: 555n,
    username: null,
    firstName: null,
    photoUrl: null,
    botAccess: true,
    blockedAt: null,
    showTelegramOnBio: true,
    shareUsername: false,
    linkedAt: new Date(),
    lastSeenAt: null,
    ...over,
  };
}

function callback(query: Record<string, string>) {
  const res = {
    statusCode: 0,
    location: "",
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.headersSent = true;
    },
    redirect(code: number, url: string) {
      this.statusCode = code;
      this.location = url;
      this.headersSent = true;
    },
  };
  const qs = new URLSearchParams(query).toString();
  const req = { query, headers: {}, ip: "1.2.3.4", originalUrl: `/telegram/oidc/callback?${qs}` };
  return handleTelegramOidcCallback(req as never, res as never).then(() => res);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  session.userId = USER;
  op.claims = { sub: "555", preferred_username: "maya", given_name: "Maya" };
  op.scope = "openid profile telegram:bot_access";
  op.audience = "client";
  op.signWithOtherKey = false;
  op.tokenError = false;
  op.tokenRequests = [];
  resetOidcConfigForTests();
  Object.assign(env, {
    TELEGRAM_ENABLED: true,
    TELEGRAM_OIDC_CLIENT_ID: "client",
    TELEGRAM_OIDC_CLIENT_SECRET: "secret",
    API_HOST: "api.staging.amped.bio",
    APP_URL: "https://app.staging.amped.bio",
  });
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
  db.telegramAccount.upsert.mockResolvedValue(account());
});

describe("claimsToIdentity", () => {
  it("reads the Telegram id from sub or id and keeps it as a 64 bit integer", () => {
    expect(claimsToIdentity({ sub: "123456789" }, "").telegramUserId).toBe(123456789n);
    expect(claimsToIdentity({ id: 987 }, "").telegramUserId).toBe(987n);
  });

  it("refuses a missing, non numeric or oversized id", () => {
    expect(() => claimsToIdentity({}, "")).toThrow();
    expect(() => claimsToIdentity({ sub: "abc" }, "")).toThrow();
    expect(() => claimsToIdentity({ sub: String(2n ** 53n) }, "")).toThrow();
  });

  it("sets botAccess only when telegram:bot_access was granted", () => {
    expect(claimsToIdentity({ sub: "1" }, "openid profile telegram:bot_access").botAccess).toBe(
      true
    );
    expect(claimsToIdentity({ sub: "1" }, "openid profile").botAccess).toBe(false);
  });

  it("keeps only an https photo and never asks for a phone", () => {
    expect(claimsToIdentity({ sub: "1", picture: "http://x/y.jpg" }, "").photoUrl).toBeNull();
    expect(claimsToIdentity({ sub: "1", picture: "https://t.me/i/a.jpg" }, "").photoUrl).toBe(
      "https://t.me/i/a.jpg"
    );
    expect(claimsToIdentity({ sub: "1", phone_number: "+1" }, "")).not.toHaveProperty("phone");
  });
});

describe("telegram.link router", () => {
  it("status hides the Telegram id and reports the global delivery choice", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account());
    db.notificationPreference.findUnique.mockResolvedValue({ telegramEnabled: true });
    const status = await caller.status();
    expect(status).toMatchObject({ available: true, linked: true, telegramBroadcasts: true });
    expect(
      JSON.stringify(status, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    ).not.toContain("555");
  });

  it("start refuses while Telegram is not configured", async () => {
    Object.assign(env, { TELEGRAM_ENABLED: false });
    await expect(caller.start()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("pkcePair makes a 43 character verifier and its S256 challenge", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("start stores the PKCE verifier against a state bound to the caller", async () => {
    const { url } = await caller.start();
    const parsed = new URL(url);
    expect(parsed.searchParams.get("scope")).toBe("openid profile telegram:bot_access");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://api.staging.amped.bio/telegram/oidc/callback"
    );
    expect(parsed.origin + parsed.pathname).toBe("https://oauth.telegram.org/auth");
    expect(parsed.searchParams.get("client_id")).toBe("client");
    const state = parsed.searchParams.get("state")!;
    const pending = store.get(`tg:oidc:${state}`) as { userId: number; verifier: string };
    expect(pending.userId).toBe(USER);
    // The challenge sent is the S256 of the verifier kept server side
    expect(parsed.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(pending.verifier).digest("base64url")
    );
  });

  it("turning updates on writes the global row and a consent event with the policy version", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account());
    db.notificationPreference.findUnique.mockResolvedValue(null);
    await caller.setPreferences({ telegramBroadcasts: true });
    expect(db.notificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: USER, creatorUserId: 0, telegramEnabled: true },
      })
    );
    const event = db.telegramLinkEvent.create.mock.calls[0]![0].data;
    expect(event).toMatchObject({ kind: "updates_on", source: "settings" });
    expect(event.policyVersion).toMatch(/^\d{4}-/);
  });

  it("setPreferences refuses before linking", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(null);
    await expect(caller.setPreferences({ shareUsername: true })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("unlink deletes the link, turns delivery off and queues one closing notice", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account());
    await caller.unlink();
    expect(db.telegramAccount.delete).toHaveBeenCalledWith({ where: { userId: USER } });
    expect(db.notificationPreference.updateMany).toHaveBeenCalledWith({
      where: { userId: USER, creatorUserId: 0 },
      data: { telegramEnabled: false },
    });
    expect(db.telegramLinkEvent.create.mock.calls[0]![0].data.kind).toBe("unlinked");
    expect(db.telegramOutbox.create.mock.calls[0]![0].data).toMatchObject({
      kind: "notice",
      chatId: 555n,
    });
  });

  it("unlink of a user who blocked the bot sends nothing", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account({ blockedAt: new Date() }));
    await caller.unlink();
    expect(db.telegramOutbox.create).not.toHaveBeenCalled();
  });
});

describe("GET /telegram/oidc/callback", () => {
  beforeEach(() => {
    store.set("tg:oidc:state-abc", { userId: USER, verifier: "verifier-123" });
  });

  it("links the signed in user who started the flow and redirects to Account", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(null);
    const res = await callback({ code: "c", state: "state-abc" });
    expect(res.location).toBe(
      "https://app.staging.amped.bio/account?open=connected-apps&telegram=linked"
    );
    expect(db.telegramAccount.upsert.mock.calls[0]![0].create).toMatchObject({
      userId: USER,
      telegramUserId: 555n,
      botAccess: true,
    });
    // Stored names are encrypted, never plain
    expect(db.telegramAccount.upsert.mock.calls[0]![0].create.username).toMatch(/^v1\./);
    // The code exchange carries the PKCE verifier and the registered redirect
    const grant = op.tokenRequests[0]!;
    expect(grant.get("grant_type")).toBe("authorization_code");
    expect(grant.get("code")).toBe("c");
    expect(grant.get("redirect_uri")).toBe(telegramRedirectUri());
    expect(grant.get("code_verifier")).toBe("verifier-123");
    expect(store.has("tg:oidc:state-abc")).toBe(false);
  });

  it("refuses a Telegram id already linked to another user (CONFLICT)", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account({ userId: 99 }));
    const res = await callback({ code: "c", state: "state-abc" });
    expect(res.location).toContain("telegram=conflict");
    expect(db.telegramAccount.upsert).not.toHaveBeenCalled();
  });

  it("never links when the session is a different user", async () => {
    session.userId = 8;
    const res = await callback({ code: "c", state: "state-abc" });
    expect(res.location).toContain("telegram=expired");
    expect(db.telegramAccount.upsert).not.toHaveBeenCalled();
  });

  it("an unknown or reused state is expired", async () => {
    const res = await callback({ code: "c", state: "other" });
    expect(res.location).toContain("telegram=expired");
  });

  it("a user who cancels on Telegram lands on declined", async () => {
    const res = await callback({ error: "access_denied", state: "state-abc" });
    expect(res.location).toContain("telegram=declined");
  });

  it("an ID token signed by another key is refused", async () => {
    op.signWithOtherKey = true;
    const res = await callback({ code: "c", state: "state-abc" });
    expect(res.location).toContain("telegram=error");
    expect(db.telegramAccount.upsert).not.toHaveBeenCalled();
  });

  it("an ID token for another client is refused", async () => {
    op.audience = "someone-else";
    const res = await callback({ code: "c", state: "state-abc" });
    expect(res.location).toContain("telegram=error");
    expect(db.telegramAccount.upsert).not.toHaveBeenCalled();
  });

  it("a failed code exchange lands on error and links nothing", async () => {
    op.tokenError = true;
    const res = await callback({ code: "c", state: "state-abc" });
    expect(res.location).toContain("telegram=error");
    expect(db.telegramAccount.upsert).not.toHaveBeenCalled();
  });
});
