import { z } from "zod";

// ================ validation helpers ================
// Mirrors the semantics used by apps/server:
// - defaults only apply when the variable is not set at all
// - booleans accept true/t/1 and false/f/0
// - ports must be an integer between 1 and 65535
function boolSchema(fallback: boolean) {
  return z
    .preprocess(value => {
      if (value === true || value === "true" || value === "t" || value === "1") return true;
      if (value === false || value === "false" || value === "f" || value === "0") return false;
      return value;
    }, z.boolean())
    .default(fallback);
}

// ================ environment schema ================
// Variables without a default are environment specific: their value differs
// between development, staging and production, so shipping a default would
// silently run the wrong configuration in whichever environment it does not
// match. They are required and the process fails fast when any is missing.
const envSchema = z.object({
  // ---------- Runtime ----------
  APP_ENV: z.enum(["development", "staging", "production", "testing"]),
  PORT: z.preprocess(value => Number(value), z.number().int().min(1).max(65535)).default(44000),

  // ---------- Database ----------
  DATABASE_URL: z.string().min(1),

  // ---------- Better Auth ----------
  BETTER_AUTH_SECRET: z.string().min(16),
  // Public origin of the auth subdomain, e.g. https://auth.amped.bio
  BETTER_AUTH_URL: z.string().min(1),

  // ---------- JWT ----------
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),

  // ---------- OAuth ----------
  MCP_RESOURCE_URL: z.string().min(1),
  OAUTH_TRUSTED_CLIENT_IDS: z.string().default(""),
  CORS_ORIGINS: z.string().min(1),
  // Empty is a valid value when the frontends share a host (localhost);
  // required so production cannot silently fall back to no cross-domain cookie.
  COOKIE_DOMAIN: z.string(),

  // ---------- App URLs ----------
  APP_URL: z.string().min(1),
  LANDINGPAGE_URL: z.string().min(1),

  // ---------- Google OAuth (social login, optional) ----------
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),

  // ---------- CAPTCHA ----------
  CAPTCHA_SECRET_KEY: z.string().min(1),
  CAPTCHA_SERVER_URL: z.string().min(1),
  CAPTCHA_SITE_KEY: z.string().min(1),

  // ---------- SMTP ----------
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.preprocess(value => Number(value), z.number().int().min(1).max(65535)),
  SMTP_SECURE: boolSchema(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM_EMAIL: z.string().default("noreply@amped.bio"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
