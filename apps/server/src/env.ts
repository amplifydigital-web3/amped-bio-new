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
  // URL for the client app (apps/client). Required: without an explicit value a
  // misconfigured deployment would silently redirect to the localhost default.
  APP_URL: z.string(),
  // URL for the public landing page (apps/landingpage). Its origin is the `aud`
  // of the wallet token handed to Web3Auth.
  LANDINGPAGE_URL: z.string(),
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

  // Analytics visitor location (MaxMind GeoLite2 City, IPv4 and IPv6).
  // Either point GEOIP_DB_PATH at an .mmdb kept current by geoipupdate, or set
  // a free GeoLite account ID and license key and the server downloads and
  // refreshes the database itself. With neither, only IPv4 is located, from
  // data bundled with the fast-geoip package.
  GEOIP_DB_PATH: z.string().default(""),
  MAXMIND_ACCOUNT_ID: z.string().default(""),
  MAXMIND_LICENSE_KEY: z.string().default(""),
  // Where the downloaded database is cached (defaults to the OS temp dir)
  GEOIP_CACHE_DIR: z.string().default(""),
  // MaxMind publishes GeoLite2 twice a week; daily checks stay well inside
  // the 30 downloads a day GeoLite accounts allow
  GEOIP_REFRESH_HOURS: z.coerce.number().int().min(1).default(24),

  SMTP_HOST: z.string(),
  SMTP_PORT: z.preprocess(value => Number(value), z.number().int().min(1).max(65535)),
  // Whether to use secure connection (TLS)
  SMTP_SECURE: boolSchema(false),
  // SMTP authentication username
  SMTP_USER: z.string().default(""), // MailDev doesn't require authentication
  // SMTP authentication password
  SMTP_PASSWORD: z.string().default(""), // MailDev doesn't require authentication
  // Email address to use as sender
  SMTP_FROM_EMAIL: z.string().default("noreply@amped.bio"),
  // ---------- Email delivery (SMTP2GO) ----------
  // auto: the SMTP2GO API when SMTP2GO_API_KEY is set, SMTP otherwise
  EMAIL_TRANSPORT: z.enum(["auto", "smtp", "smtp2go-api"]).default("auto"),
  // SMTP2GO API key (Sending > API Keys), needs the Email send permission
  SMTP2GO_API_KEY: z.string().default(""),
  // SMTP2GO API base. Regional: https://us-api.smtp2go.com/v3, eu-api, au-api
  SMTP2GO_API_URL: z.string().url().default("https://api.smtp2go.com/v3"),
  // Display name on the From line
  SMTP_FROM_NAME: z.string().default("Amped.Bio"),

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
  // Optional override for the bot username. The runtime resolves it from the Bot
  // API getMe() (services/telegram/client.ts), so it always matches the token in
  // use; set this only in tests or a split environment the token cannot reach.
  TELEGRAM_BOT_USERNAME: z.string().default(""),
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

  // USDC in the wallet (Build Board #29), spec docs/features/usdc-wallet-onramp.md 3.3 and 3.4.
  // Master switch for gasless sends and the indexer. Off until the CDP relayer account exists.
  USDC_ENABLED: boolSchema(false),
  // "base" in production; anything else is Base Sepolia
  PAYMENT_CHAIN: z.string().default("base-sepolia"),
  // CDP Node RPC for Base in production; empty uses the chain's public endpoint (staging)
  BASE_RPC_URL: z.string().default(""),
  // CDP Server Wallet relayer (Coinbase holds the key). API key id and secret, Wallet Secret,
  // and the account name created once per environment in the CDP Portal.
  CDP_API_KEY_ID: z.string().default(""),
  CDP_API_KEY_SECRET: z.string().default(""),
  CDP_WALLET_SECRET: z.string().default(""),
  CDP_RELAYER_ACCOUNT: z.string().default(""),
  // Relayer ETH on Base, in ETH: alarm below the first, sends pause below the second
  RELAYER_GAS_ALARM_ETH: z.string().default("0.05"),
  RELAYER_GAS_STOP_ETH: z.string().default("0.01"),
  // Circle Compliance Engine standalone address screening, once Circle grants access
  CIRCLE_API_KEY: z.string().default(""),
  // Circle's chain enum for an EVM address screen. The API lists no Base value; ETH screens the same address.
  CIRCLE_SCREENING_CHAIN: z.string().default("ETH"),
  // Chainalysis sanctions oracle on Base (0x3A91A31cB3dC49b4db9Ce721F50a9D076c8D739B). Not deployed on Base Sepolia.
  CHAINALYSIS_ORACLE: z.string().default(""),
  // Comma separated addresses always refused. Staging uses it for the screening acceptance test.
  USDC_SCREEN_DENYLIST: z.string().default(""),
  // When no screening vendor is configured: refuse every send (production) or allow and record unscreened (staging)
  USDC_SCREENING_REQUIRED: boolSchema(true),
  // Buy USDC through Coinbase (Build Board #5), spec 3.5 and 3.12. Server switch for the
  // onramp.* procedures and the webhook. The CDP API key above signs Onramp calls too.
  ONRAMP_ENABLED: boolSchema(false),
  // Secret from the CDP webhook subscription for onramp.transaction.* events
  CDP_ONRAMP_WEBHOOK_SECRET: z.string().default(""),
  // Coinbase sandbox: partnerUserRef gets the sandbox- prefix, orders never charge and deliver
  // nothing on chain, so arrival follows the webhook. On by default outside production.
  ONRAMP_SANDBOX: boolSchema(false),
  // Apple Pay and Google Pay (Headless Onramp, USDC-5): the domain the Coinbase payment frame is
  // embedded on. Must be on the CDP Onramp domain allowlist. Empty means the APP_URL host.
  ONRAMP_DOMAIN: z.string().default(""),
  // Key for the stored Coinbase userAuthToken (AES-256-GCM). Falls back to BETTER_AUTH_SECRET.
  ONRAMP_DATA_KEY: z.string().default(""),
  // Content system (Build Board #20), PR 2. Spec 3.17. Secrets never live in committed .env files.
  // Master switch for uploads. Off everywhere until the Cloudflare setup checklist is done.
  // Turning it off during an incident stops new uploads; items already stored keep working.
  CONTENT_UPLOADS_ENABLED: boolSchema(false),
  // Cloudflare account that owns the R2 bucket and the Stream library (staging has its own account)
  CF_ACCOUNT_ID: z.string().default(""),
  // R2 API token (S3 compatible), Object Read and Write on R2_BUCKET only
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  // amped-content (production) or amped-content-staging
  R2_BUCKET: z.string().default(""),
  // Stream API token: Stream Edit on this account
  CF_STREAM_API_TOKEN: z.string().default(""),
  // Stream signing key from POST /stream/keys: the key id and the PEM (base64 as Cloudflare returns it, or raw PEM)
  CF_STREAM_KEY_ID: z.string().default(""),
  CF_STREAM_KEY_PEM: z.string().default(""),
  // Secret Cloudflare returns when the Stream webhook URL is set
  CF_STREAM_WEBHOOK_SECRET: z.string().default(""),
  // Hostnames Stream accepts playback from, comma separated (amped.bio,app.amped.bio on production)
  CF_STREAM_ALLOWED_ORIGINS: z.string().default(""),
  // Media gateway origin, e.g. https://media.ampedusercontent.com (PR 3 deploys the Worker)
  MEDIA_GATEWAY_ORIGIN: z.string().default(""),
  // kid:base64urlSecret,kid:base64urlSecret. The first signs; all verify (rotation, spec 3.6)
  MEDIA_TOKEN_KEYS: z.string().default(""),
  // Shared with the processor Worker (PR 4): signs POST /internal/content/processed and /job
  CONTENT_PROCESSOR_SECRET: z.string().default(""),
  // Queues HTTP publish (PR 4): API token with Queues Edit, and the content-ingest queue id
  CF_QUEUES_API_TOKEN: z.string().default(""),
  CF_CONTENT_QUEUE_ID: z.string().default(""),
  // Stream customer code for thumbnail URLs (customer-{code}.cloudflarestream.com). Optional:
  // read from the video when empty
  CF_STREAM_CUSTOMER_CODE: z.string().default(""),
  // Per kind upload limits in MB (spec 3.2)
  UPLOAD_LIMIT_CONTENT_VIDEO_MB: numSchema(2048),
  UPLOAD_LIMIT_CONTENT_AUDIO_MB: numSchema(500),
  UPLOAD_LIMIT_CONTENT_IMAGE_MB: numSchema(25),
  UPLOAD_LIMIT_CONTENT_DOCUMENT_MB: numSchema(100),
  UPLOAD_LIMIT_CONTENT_FILE_MB: numSchema(500),
  // Default per creator quota (spec 3.2, decision 5)
  CONTENT_QUOTA_DEFAULT_MB: numSchema(5120),
  CONTENT_QUOTA_VIDEO_MINUTES: numSchema(300),

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

// USDC sends fail closed without a screening vendor in production only. Base Sepolia has no
// Chainalysis oracle, so staging records sends as unscreened unless the variable is set.
if (process.env.USDC_SCREENING_REQUIRED === undefined && env.APP_ENV !== "production") {
  env.USDC_SCREENING_REQUIRED = false;
}

// Buy USDC uses Coinbase's sandbox everywhere but production unless the variable is set.
if (process.env.ONRAMP_SANDBOX === undefined && env.APP_ENV !== "production") {
  env.ONRAMP_SANDBOX = true;
}
