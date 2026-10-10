import { z } from "zod";

// ================ validation helpers ================
// These helpers mirror the semantics previously provided by the `envalid`
// package so the migration does not change runtime behavior:
// - defaults only apply when the variable is not set at all
// - booleans accept true/t/1 and false/f/0 (case-sensitive, like envalid)
// - numbers are parsed with parseFloat and must not be NaN
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

function numSchema(fallback: number) {
  return z
    .preprocess(
      value => parseFloat(value as string),
      z.number().refine(n => !Number.isNaN(n))
    )
    .default(fallback);
}

function portSchema(fallback: number) {
  return z.preprocess(value => Number(value), z.number().int().min(1).max(65535)).default(fallback);
}

// ================ environment schema ================
const envSchema = z.object({
  // The environment the app is running in
  APP_ENV: z.enum(["development", "production", "testing", "staging"]).default("development"),

  // Private key for JWT signing
  JWT_PRIVATE_KEY: z.string(),

  // Port for the server to listen on
  PORT: portSchema(43000),
  // URL for the client app (apps/client)
  APP_URL: z.string().default("http://localhost:5173"),
  // URL for the public landing page (apps/landingpage). Its origin is the `aud`
  // of the wallet token handed to Web3Auth.
  LANDINGPAGE_URL: z.string().default("http://localhost:3000"),
  // Cookie domain for cross-subdomain auth (e.g. .amped.bio). Leave empty for localhost.
  COOKIE_DOMAIN: z.string().default(""),
  // Comma-separated list of allowed CORS origins
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),
  // Host for the API
  API_HOST: z.string().default("localhost:43000"),
  // How many proxies (or which addresses) sit in front of the server, so
  // Express derives req.ip from X-Forwarded-For only for trusted hops.
  // Accepts an Express trust proxy expression: a hop count ("1"), "loopback",
  // a subnet ("10.0.0.0/8") or a comma-separated list. Empty disables trust.
  TRUST_PROXY: z.string().default(""),

  // New SMTP variables with MailDev defaults
  // SMTP server host
  SMTP_HOST: z.string().default("localhost"), // Default for MailDev
  // SMTP server port
  SMTP_PORT: portSchema(1025), // Default for MailDev
  // Whether to use secure connection (TLS)
  SMTP_SECURE: boolSchema(false),
  // SMTP authentication username
  SMTP_USER: z.string().default(""), // MailDev doesn't require authentication
  // SMTP authentication password
  SMTP_PASSWORD: z.string().default(""), // MailDev doesn't require authentication
  // Email address to use as sender
  SMTP_FROM_EMAIL: z.string().default("noreply@amped.bio"),

  // Faucet configuration
  // Private key for the faucet wallet to send tokens from
  FAUCET_PRIVATE_KEY: z.string().default(""),
  // Amount of tokens to send from the faucet
  FAUCET_AMOUNT: z.string().default("0.001"),
  // If true, don't actually send funds but return a dummy transaction hash
  FAUCET_MOCK_MODE: z.enum(["true", "false"]).default("false"),

  // Affiliate Rewards Configuration
  // Private key for the affiliate rewards wallet
  AFFILIATES_PRIVATE_KEY: z.string().default(""),

  // NDAU Conversion Configuration
  // Private key for NDAU conversion REVO payouts
  NDAU_CONVERSION_PRIVATE_KEY: z.string().default(""),

  // AWS S3 Configuration for profile picture uploads
  // AWS Region
  AWS_REGION: z.string(),
  // AWS Access Key ID
  AWS_ACCESS_KEY_ID: z.string(),
  // AWS Secret Access Key
  AWS_SECRET_ACCESS_KEY: z.string(),
  // AWS S3 Bucket Name for file uploads
  AWS_S3_BUCKET_NAME: z.string().default("amped-bio"), // Matches the initialBuckets in docker-compose
  // Public URL for S3 bucket (can use CloudFront URL)
  AWS_S3_PUBLIC_URL: z.string().default(""),
  // Custom S3 endpoint URL (for S3-compatible services like MinIO or S3Mock)
  AWS_S3_ENDPOINT: z.string().default(""),

  // Self-hosted Cap captcha configuration
  // Base URL of the Cap instance
  CAPTCHA_SERVER_URL: z.string().default(""),
  // Cap site key that scopes token verification
  CAPTCHA_SITE_KEY: z.string().default(""),
  // Cap secret key used for server-side verification
  CAPTCHA_SECRET_KEY: z.string().default(""),

  // File upload size limits (in MB)
  // Maximum file size in MB for background uploads
  UPLOAD_LIMIT_BACKGROUND_MB: numSchema(5),
  // Maximum file size in MB for profile photo uploads
  UPLOAD_LIMIT_PROFILE_PHOTO_MB: numSchema(1),
  // Maximum file size in MB for pool image uploads
  UPLOAD_LIMIT_POOL_IMAGE_MB: numSchema(2),
  // Maximum file size in MB for collection thumbnail uploads
  UPLOAD_LIMIT_COLLECTION_THUMBNAIL_MB: numSchema(2),

  // oauth vars
  // Google OAuth 2.0 Client Secret
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  // Google OAuth 2.0 Client ID
  GOOGLE_CLIENT_ID: z.string().default(""),

  // Public origin of the auth server (apps/auth-server), used as the OAuth/OIDC
  // issuer. Required: tokens signed here must carry the same issuer as the auth
  // server. Example: https://auth.staging.amped.bio
  BETTER_AUTH_URL: z.string().url(),
  // Canonical protected resource identifier of the MCP server (RFC 8707/RFC 9728).
  MCP_RESOURCE_URL: z.string().url(),
  // Comma-separated list of OAuth client ids that skip the consent screen.
  OAUTH_TRUSTED_CLIENT_IDS: z.string().default(""),

  // Better Auth secret for authentication
  BETTER_AUTH_SECRET: z.string(),

  // Redis Configuration
  // Redis server host
  REDIS_HOST: z.string().default("localhost"),
  // Redis server port
  REDIS_PORT: portSchema(26379),
  // Redis authentication password
  REDIS_PASSWORD: z.string().default(""),
  // Enable TLS connection for Redis (required for Upstash)
  REDIS_TLS: boolSchema(false),

  // Creator Pool Broadcast (Build Board #1). While true, only pool owners an
  // admin has invited can send. Defaults to true in production for the pilot
  // and to false everywhere else, so staging can test sends (QA-056, below).
  BROADCAST_INVITE_ONLY: boolSchema(true),

  // URL for the RNS subgraph to validate name ownership and expiry
  SUBGRAPH_URL: z.string().default(""),

  // Authbase identity verification API (wallet KYC status lookups)
  AUTHBASE_BASE_URL: z.string().default(""),
  // Authbase API key (Basic auth username)
  AUTHBASE_API_KEY: z.string().default(""),
  // Authbase API secret (Basic auth password)
  AUTHBASE_API_SECRET: z.string().default(""),
  // Screen Review 109 I01: the public page may show the Verified chip and the
  // check dates. Off: the page shows the RNS name only and never calls Authbase.
  RNS_PUBLIC_IDENTITY: boolSchema(false),
  // Screen Review 079 D2: a name page may show the attributes a Verified owner
  // shared through Authbase. Off by default: the published Privacy Policy says
  // only the owner sees them. Turn on only after the policy is updated.
  RNS_PUBLIC_ATTRIBUTES: boolSchema(false),

  // Creator analytics
  // Secret mixed into the daily visitor hash salt. Falls back to BETTER_AUTH_SECRET when empty.
  ANALYTICS_SALT_SECRET: z.string().default(""),
  // Optional Anthropic API key. When set, the analytics dashboard adds an AI written summary.
  ANTHROPIC_API_KEY: z.string().default(""),
  // Anthropic model used for the AI analytics summary
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),

  // Creator tracking pixels
  // Secret used to encrypt creators' Meta and TikTok API tokens. Falls back to BETTER_AUTH_SECRET.
  // Changing it makes stored tokens unreadable, so creators would need to re-enter them.
  TRACKING_TOKEN_SECRET: z.string().default(""),
  // Meta Graph API version used for the Conversions API
  META_GRAPH_API_VERSION: z.string().default("v24.0"),

  // Messaging on Telegram (Build Board #2), spec 3.14. Secrets never live in committed .env files.
  // Master switch: starts the sender loop and accepts webhook updates. Off everywhere until the
  // staging bot exists.
  TELEGRAM_ENABLED: boolSchema(false),
  // Bot token from BotFather (@AmpedBioStagingBot on staging, @AmpedBioBot in production)
  TELEGRAM_BOT_TOKEN: z.string().default(""),
  // Bot username without the @, used in deep links and the inline card
  TELEGRAM_BOT_USERNAME: z.string().default("AmpedBioBot"),
  // Value passed as secret_token to setWebhook; the webhook route rejects requests without it
  TELEGRAM_WEBHOOK_SECRET: z.string().default(""),
  // Log In with Telegram (OIDC) client credentials from BotFather, Login Widget
  TELEGRAM_OIDC_CLIENT_ID: z.string().default(""),
  TELEGRAM_OIDC_CLIENT_SECRET: z.string().default(""),
  // Encrypts username, firstName and photoUrl on telegram_accounts. Falls back to BETTER_AUTH_SECRET.
  TELEGRAM_SECRET_BOX_KEY: z.string().default(""),
  // While true, only creators an admin has invited can turn on Fan messages (phase 1 pilot)
  MESSAGING_INVITE_ONLY: boolSchema(true),
  // Gated creator groups (phase 2)
  TELEGRAM_GROUPS: boolSchema(false),
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

// QA-056: the pilot gate is on by default in production only. Staging, testing
// and local runs open Broadcast to every pool owner unless the variable is set.
if (process.env.BROADCAST_INVITE_ONLY === undefined && env.APP_ENV !== "production") {
  env.BROADCAST_INVITE_ONLY = false;
}
