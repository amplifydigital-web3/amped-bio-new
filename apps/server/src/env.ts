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
  // Audience of the JWT token
  JWT_AUDIENCE: z.string().default("amped.bio"),

  // Port for the server to listen on
  PORT: portSchema(43000),
  // URL for the app in production
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  // URL for the public Next.js site (for cross-subdomain auth)
  SITE_URL: z.string().default("http://localhost:3000"),
  // Cookie domain for cross-subdomain auth (e.g. .amped.bio). Leave empty for localhost.
  COOKIE_DOMAIN: z.string().default(""),
  // Comma-separated list of allowed CORS origins
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),
  // Host for the API
  API_HOST: z.string().default("localhost:43000"),

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

  // Secret key for Google reCAPTCHA verification
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

  // URL for the RNS subgraph to validate name ownership and expiry
  SUBGRAPH_URL: z.string().default(""),
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
