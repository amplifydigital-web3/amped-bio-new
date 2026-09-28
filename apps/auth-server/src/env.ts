import { z } from "zod";

const envSchema = z.object({
  // ---------- Runtime ----------
  APP_ENV: z.enum(["development", "staging", "production", "testing"]).default("development"),
  PORT: z.coerce.number().default(44000),

  // ---------- Database ----------
  DATABASE_URL: z.string().default("mysql://root:password@localhost:3306/amped_bio"),

  // ---------- Better Auth ----------
  BETTER_AUTH_SECRET: z.string().min(16),
  // Public origin of the auth subdomain, e.g. https://auth.amped.bio
  BETTER_AUTH_URL: z.string().default(""),

  // ---------- JWT ----------
  JWT_PRIVATE_KEY: z.string(),
  JWT_AUDIENCE: z.string().default("amped.bio"),

  // ---------- OAuth ----------
  MCP_RESOURCE_URL: z.string().default(""),
  OAUTH_TRUSTED_CLIENT_IDS: z.string().default(""),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),
  COOKIE_DOMAIN: z.string().default(""),

  // ---------- App URLs ----------
  APP_URL: z.string().default("http://localhost:5173"),
  LANDINGPAGE_URL: z.string().default("http://localhost:3000"),

  // ---------- Google OAuth (social login) ----------
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),

  // ---------- CAPTCHA ----------
  CAPTCHA_SECRET_KEY: z.string().default(""),
  CAPTCHA_SERVER_URL: z.string().default(""),
  CAPTCHA_SITE_KEY: z.string().default(""),

  // ---------- SMTP ----------
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM_EMAIL: z.string().default("noreply@amped.bio"),

  // ---------- Redis ----------
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(26379),
  REDIS_PASSWORD: z.string().default(""),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;