import { prisma } from "../services/DB";
import { env } from "../env";
import { processEmailToUniqueHandle } from "./onelink-generator";
import { sendEmailVerification, sendPasswordResetEmail, sendWelcomeEmail } from "./email/email";
import { hashPassword, verifyPassword } from "./password";
import { APIError, betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { captcha, jwt, customSession, twoFactor } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { oauthDeviceAuthorization } from "@better-auth/oauth-provider";
import crypto from "crypto";
import { JWTPayload, SignJWT } from "jose";
import type { EnrichedUser } from "../types/auth-helpers";
import { uuidv7 } from "./uuid-v7";

// === jwt private key generation  ===
const pk = crypto.createPrivateKey({
  key: Buffer.from(env.JWT_PRIVATE_KEY, "utf8"),
  format: "pem",
  type: "pkcs8",
});

const pb = crypto.createPublicKey(pk);

// Public origin of the auth server. The OAuth/OIDC issuer is this origin plus
// the `/auth` base path; every token this server signs must carry it as `iss`
// so access tokens, ID tokens and the app session JWTs verify consistently.
export const AUTH_BASE_URL = (
  env.BETTER_AUTH_URL || (env.API_HOST.startsWith("http") ? env.API_HOST : `https://${env.API_HOST}`)
).replace(/\/+$/, "");

export const OAUTH_ISSUER = `${AUTH_BASE_URL}/auth`;

export const JWT_KEYS = {
  alg: "RS256" as const,
  privateKey: pk,
  publicKey: pb,
  kid: crypto
    .createHash("sha256")
    .update(pb.export({ format: "pem", type: "spki" }))
    .digest("hex")
    .substring(0, 16), // Key ID for the JWT
  aud: env.JWT_AUDIENCE,
  iss: OAUTH_ISSUER,
};

// ================ OAuth 2.1 provider settings ==================
// Paths are resolved against the API origin by Better Auth, so the Express app
// redirects them to the landing page (see services/API.ts).
export const OAUTH_LOGIN_PATH = "/oauth/login";
export const OAUTH_CONSENT_PATH = "/oauth/consent";
export const OAUTH_DEVICE_PATH = "/oauth/device";

// Scopes every OAuth client may request. `openid` is what makes this an OIDC
// provider; `mcp:read` is bound to the protected MCP resource.
export const OAUTH_SCOPES = ["openid", "profile", "email", "offline_access", "mcp:read"] as const;

// Identity-only scopes granted by default to dynamically registered clients.
export const IDENTITY_SCOPES = ["openid", "profile", "email", "offline_access"] as const;

// Identity access tokens are short lived; long lived access is delegated to
// refresh tokens (`offline_access`).
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// First-party clients skip the consent screen.
const trustedOAuthClientIds = env.OAUTH_TRUSTED_CLIENT_IDS.split(",")
  .map(clientId => clientId.trim())
  .filter(Boolean);

// In this pnpm workspace the @better-auth/* packages resolve their own copy of
// @better-auth/core, so their plugin objects are structurally different from
// better-auth's `BetterAuthPlugin` even though they are compatible at runtime.
// The intersection keeps the plugin's own types (its endpoints feed `auth.api`)
// while still satisfying the plugins array.
const asBetterAuthPlugin = <T>(plugin: T) => plugin as unknown as BetterAuthPlugin & T;

// ================ better-auth configuration ==================
export const auth = betterAuth({
  basePath: "/auth",
  trustedOrigins: [
    env.APP_URL,
    env.LANDINGPAGE_URL,
    ...env.CORS_ORIGINS.split(",")
      .map(origin => origin.trim())
      .filter(Boolean),
  ],
  plugins: [
    customSession(async ({ user, session }) => {
      const u = user as unknown as EnrichedUser;
      // Backfill handle for existing users without one
      const userHandle = u.handle;
      if ((!userHandle || userHandle === "") && u.email) {
        const newHandle = await processEmailToUniqueHandle(u.email);
        await prisma.user.update({
          where: { id: parseInt(u.id) },
          data: { handle: newHandle },
        });
        u.handle = newHandle;
      }

      const userWallet = await prisma.userWallet.findUnique({
        where: { userId: parseInt(u.id) },
      });

      // Fetch creator pools to determine which chains have confirmed pool addresses.
      // This avoids the frontend calling syncPoolCreation (blockchain RPC) for already-confirmed pools.
      const creatorPools = userWallet
        ? await prisma.creatorPool.findMany({
            where: { walletId: userWallet.id },
            select: { chainId: true, poolAddress: true },
          })
        : [];

      const poolAddresses: Record<string, string> = {};
      for (const pool of creatorPools) {
        if (pool.poolAddress) {
          poolAddresses[pool.chainId] = pool.poolAddress;
        }
      }

      return {
        user: {
          ...u,
          wallet: userWallet?.address ?? null,
          poolAddresses,
        },
        session,
      };
    }),
    captcha({
      // Cap exposes a reCAPTCHA-shaped `/siteverify` endpoint, so the hCaptcha
      // handler (which only checks `success`) verifies Cap tokens as-is.
      provider: "hcaptcha",
      secretKey: env.CAPTCHA_SECRET_KEY,
      siteVerifyURLOverride: `${env.CAPTCHA_SERVER_URL}/${env.CAPTCHA_SITE_KEY}/siteverify`,
    }),
    twoFactor({
      issuer: "Amped.Bio",
      skipVerificationOnEnable: false,
      twoFactorCookieMaxAge: 600, // 10 minutes
      trustDeviceMaxAge: 30 * 24 * 60 * 60, // 30 days
      totpOptions: {
        digits: 6,
        period: 30,
      },
      backupCodeOptions: {
        amount: 10,
        length: 10,
        storeBackupCodes: "encrypted",
      },
    }),
    jwt({
      disableSettingJwtHeader: true,
      jwt: {
        // The OAuth provider validates `iss` against its own issuer, so both the
        // plugin and our signing override must use OAUTH_ISSUER.
        issuer: OAUTH_ISSUER,
        sign: async (jwtPayload: JWTPayload) => {
          const builder = new SignJWT(jwtPayload).setIssuedAt();

          // Resource-bound access tokens carry their own `aud` (the protected
          // resource) and the issuer; only fall back to the application
          // defaults for tokens that do not define them.
          if (!jwtPayload.aud) builder.setAudience(JWT_KEYS.aud);
          if (!jwtPayload.iss) builder.setIssuer(OAUTH_ISSUER);

          return await builder
            .setProtectedHeader({
              alg: JWT_KEYS.alg,
              kid: JWT_KEYS.kid,
              typ: "JWT",
            })
            .sign(pk);
        },
      },
      jwks: {
        // Public URL of the JWKS that verifies every token this server issues
        // (OAuth access tokens, ID tokens and the app session JWTs).
        remoteUrl: new URL("/.well-known/jwks.json", AUTH_BASE_URL).href,
        keyPairConfig: {
          alg: JWT_KEYS.alg,
        },
      },
    }),
    // oneTap(),
    // OAuth 2.1 / OIDC provider behind "Sign in with Amped.bio".
    // mcp() *is* the OAuth provider configured for MCP resource binding, so it
    // must never be combined with a separate oauthProvider() plugin.
    asBetterAuthPlugin(
      mcp({
        loginPage: OAUTH_LOGIN_PATH,
        consentPage: OAUTH_CONSENT_PATH,
        resource: env.MCP_RESOURCE_URL,
        scopes: [...OAUTH_SCOPES],
        accessTokenExpiresIn: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
        allowDynamicClientRegistration: true,
        clientRegistrationClientSecretExpiration: "30d",
        clientRegistrationDefaultScopes: [...IDENTITY_SCOPES],
        cachedTrustedClients: new Set(trustedOAuthClientIds),
      })
    ),
    // Client ID Metadata Documents: lets MCP clients identify themselves with a
    // hosted metadata document instead of dynamic registration.
    asBetterAuthPlugin(
      cimd({
        fetchClientMetadataResource,
        metadataProfile: "mcp-2026-07-28",
      })
    ),
    // Device authorization grant (RFC 8628) for CLIs and limited-input clients.
    asBetterAuthPlugin(oauthDeviceAuthorization({ verificationUri: OAUTH_DEVICE_PATH })),
  ],
  database: prismaAdapter(prisma, {
    provider: "mysql",
  }),
  advanced: {
    crossSubDomainCookies: env.COOKIE_DOMAIN
      ? {
          enabled: true,
          domain: env.COOKIE_DOMAIN,
        }
      : undefined,
    database: {
      // Tables managed by Better Auth fall into two groups:
      //   1. Core tables (user, session, account, verification, jwks, twoFactor)
      //      Keep database auto-increment / cuid for backward compatibility.
      //   2. OAuth / OIDC tables (oauth*, device_code)
      //      Use UUID v7 to avoid predictable sequential primary keys, which
      //      strengthens private_key_jwt replay protection and other security
      //      properties that depend on ID unpredictability.
      generateId: options => {
        const oauthModels = [
          "oauthClient",
          "oauthResource",
          "oauthClientResource",
          "oauthRefreshToken",
          "oauthAccessToken",
          "oauthConsent",
          "oauthClientAssertion",
          "deviceCode",
        ];
        if (oauthModels.includes(options.model)) {
          return uuidv7();
        }
        // Let the database handle ID generation for all other tables
        // (auto-increment or cuid defaults in the schema).
        return false;
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user: any, context: any) => {
          if ((!user.handle || user.handle === "") && user.email) {
            user.handle = await processEmailToUniqueHandle(user.email);
          }

          if (context?.provider === "google" && context?.profile?.name && !user.name) {
            user.name = context.profile.name;
          }
        },
        after: async (user: any, context: any) => {
          const referrerId = context?.query?.referrerId;
          if (referrerId) {
            try {
              // Create referral record
              await prisma.referral.create({
                data: {
                  referrerId: parseInt(referrerId),
                  referredId: parseInt(user.id),
                },
              });

              console.log(
                `Referral created: user ${user.id} referred by ${referrerId}. ` +
                  `Rewards will be sent automatically when both parties link their wallets.`
              );
            } catch (error) {
              console.error("Error creating referral:", error);
              // Don't throw - user registration should succeed even if referral creation fails
            }
          }

          // Send welcome email for Google signups (non-blocking, ignore errors)
          if (context?.provider === "google") {
            setImmediate(() => {
              try {
                sendWelcomeEmail(user.email, user.name);
              } catch (error) {
                console.error("Error sending welcome email (ignored):", error);
              }
            });
          }
        },
      },
    },
    session: {
      create: {
        before: async (session: any) => {
          const user = await prisma.user.findUnique({
            where: { id: Number(session.userId) },
            select: { block: true },
          });

          if (user?.block === "yes") {
            throw new APIError("FORBIDDEN", {
              message:
                "Your amped.bio account has been blocked. For more information, please submit a support ticket. https://amplifydigital.freshdesk.com/support/tickets/new",
            });
          }
        },
      },
    },
  },
  // Required to send the verification email. Top-level since Better Auth 1.7.
  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }: { user: any; url: any; token: any }) => {
      console.info("Sending email verification to:", JSON.stringify({ user, url, token }));
      sendEmailVerification(user.email, token);
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 1 * 60 * 60, // 1 hour
  },
  user: {
    changeEmail: {
      enabled: true,
    },
    // Only core user columns are mapped here; `handle`, `role` and
    // `twoFactorEnabled` are declared in `additionalFields` below and their
    // Prisma field names already match the Better Auth field keys.
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
      name: "name",
      image: "image",
    },
    additionalFields: {
      handle: {
        type: "string",
        required: false,
        defaultValue: null,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
      },
      image: {
        type: "string",
        required: false,
        defaultValue: null,
      },
      twoFactorEnabled: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
    sendResetPassword: async ({ user, url, token }: { user: any; url: any; token: any }) => {
      console.info("Sending password reset email to:", JSON.stringify({ user, url, token }));
      await sendPasswordResetEmail(user.email, token);
    },
  },
  socialProviders: {
    google: {
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      clientId: env.GOOGLE_CLIENT_ID,
    },
  },
});
