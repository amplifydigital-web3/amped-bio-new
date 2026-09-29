import { z } from "zod";

// ================ validation helpers ================
// Mirrors the helpers in apps/server/src/env.ts so shared variables are
// validated identically in both apps:
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

function portSchema(fallback: number) {
  return z.preprocess(value => Number(value), z.number().int().min(1).max(65535)).default(fallback);
}

// ================ environment schema ================
// Variables shared with apps/server use the exact same validation and
// defaults as apps/server/src/env.ts. Keep both files in sync.
const envSchema = z.object({
  // ---------- Runtime ----------
  // The environment the app is running in
  APP_ENV: z.enum(["development", "production", "testing", "staging"]).default("development"),
  // Port for the auth server to listen on
  PORT: portSchema(44000),

  // ---------- Database ----------
  DATABASE_URL: z.string().min(1),

  // ---------- Better Auth ----------
  // Better Auth secret for authentication
  BETTER_AUTH_SECRET: z.string(),
  // Public origin of the auth subdomain, e.g. https://auth.amped.bio
  BETTER_AUTH_URL: z.string().url(),

  // ---------- JWT ----------
  // Private key for JWT signing
  JWT_PRIVATE_KEY: z.string(),
  // Audience of the JWT token
  JWT_AUDIENCE: z.string().default("amped.bio"),

  // ---------- OAuth ----------
  // Canonical protected resource identifier of the MCP server (RFC 8707/RFC 9728).
  MCP_RESOURCE_URL: z.string().url(),
  // Comma-separated list of OAuth client ids that skip the consent screen.
  OAUTH_TRUSTED_CLIENT_IDS: z.string().default(""),
  // Comma-separated list of allowed CORS origins
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),
  // Cookie domain for cross-subdomain auth (e.g. .amped.bio). Leave empty for localhost.
  COOKIE_DOMAIN: z.string().default(""),

  // ---------- App URLs ----------
  // URL for the client app (apps/client)
  APP_URL: z.string().default("http://localhost:5173"),
  // URL for the public landing page (apps/landingpage)
  LANDINGPAGE_URL: z.string().default("http://localhost:3000"),

  // ---------- Google OAuth (social login, optional) ----------
  // Google OAuth 2.0 Client ID
  GOOGLE_CLIENT_ID: z.string().default(""),
  // Google OAuth 2.0 Client Secret
  GOOGLE_CLIENT_SECRET: z.string().default(""),

  // ---------- CAPTCHA ----------
  // Cap secret key used for server-side verification
  CAPTCHA_SECRET_KEY: z.string().default(""),
  // Base URL of the Cap instance
  CAPTCHA_SERVER_URL: z.string().default(""),
  // Cap site key that scopes token verification
  CAPTCHA_SITE_KEY: z.string().default(""),

  // ---------- SMTP ----------
  // SMTP server host
  SMTP_HOST: z.string().default("localhost"), // Default for MailDev
  // SMTP server port
  SMTP_PORT: portSchema(1025), // Default for MailDev
  // Whether to use secure connection (TLS)
  SMTP_SECURE: boolSchema(false),
  // SMTP authentication username
  SMTP_USER: z.string().default(""),
  // SMTP authentication password
  SMTP_PASSWORD: z.string().default(""),
  // Email address to use as sender
  SMTP_FROM_EMAIL: z.string().default("noreply@amped.bio"),
});

// ================ parse & export ================
const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map(issue => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .sort();
  console.error("Invalid environment variables:");
  console.error(issues.join("\n"));
  console.error("\n Exiting with error code 1");
  process.exit(1);
}

export const env = result.data;
export type Env = z.infer<typeof envSchema>;
