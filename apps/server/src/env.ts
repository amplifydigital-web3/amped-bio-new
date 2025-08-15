import { cleanEnv, str, port, bool, num } from "envalid";

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    desc: "The environment the app is running in",
    choices: ["development", "production", "testing", "staging"],
    default: "development",
    example: "development",
  }),
  JWT_SECRET: str({
    desc: "Secret key for JWT token generation and verification",
    default: "your-default-jwt-secret-for-development",
  }),
  JWT_PRIVATE_KEY: str({
    desc: "Private key for JWT signing",
  }),
  JWT_ISSUER: str({
    desc: "Issuer of the JWT token",
    default: "api.amped.bio",
    example: "api.amped.bio",
  }),
  JWT_AUDIENCE: str({
    desc: "Audience of the JWT token",
    default: "amped.bio",
    example: "amped.bio",
  }),
  PORT: port({
    desc: "Port for the server to listen on",
    default: 43000,
  }),
  FRONTEND_URL: str({
    desc: "URL for the website in production",
    default: "http://localhost:5173",
    example: "https://amped.bio",
  }),
  // New SMTP variables with MailDev defaults
  SMTP_HOST: str({
    desc: "SMTP server host",
    default: "localhost", // Default for MailDev
    example: "smtp.gmail.com",
  }),
  SMTP_PORT: port({
    desc: "SMTP server port",
    default: 1025, // Default for MailDev
    example: "587",
  }),
  SMTP_SECURE: bool({
    desc: "Whether to use secure connection (TLS)",
    default: false,
    example: "true",
  }),
  SMTP_USER: str({
    desc: "SMTP authentication username",
    default: "", // MailDev doesn't require authentication
    example: "user@example.com",
  }),
  SMTP_PASSWORD: str({
    desc: "SMTP authentication password",
    default: "", // MailDev doesn't require authentication
    example: "your-smtp-password",
  }),
  SMTP_FROM_EMAIL: str({
    desc: "Email address to use as sender",
    default: "noreply@amped.bio",
    example: "noreply@yourdomain.com",
  }),
  // Faucet configuration
  FAUCET_PRIVATE_KEY: str({
    desc: "Private key for the faucet wallet to send tokens from",
    default: "",
  }),
  FAUCET_AMOUNT: str({
    desc: "Amount of tokens to send from the faucet",
    default: "0.001",
    example: "0.001",
  }),
  FAUCET_MOCK_MODE: str({
    desc: "If true, don't actually send funds but return a dummy transaction hash",
    default: "false",
    choices: ["true", "false"],
    example: "true",
  }),

  // AWS S3 Configuration for profile picture uploads
  AWS_REGION: str({
    desc: "AWS Region",
    example: "us-west-2",
  }),
  AWS_ACCESS_KEY_ID: str({
    desc: "AWS Access Key ID",
  }),
  AWS_SECRET_ACCESS_KEY: str({
    desc: "AWS Secret Access Key",
  }),
  AWS_S3_BUCKET_NAME: str({
    desc: "AWS S3 Bucket Name for file uploads",
    default: "amped-bio", // Matches the initialBuckets in docker-compose
  }),
  AWS_S3_PUBLIC_URL: str({
    desc: "Public URL for S3 bucket (can use CloudFront URL)",
    default: "",
    example: "https://assets.amped.bio",
  }),
  AWS_S3_ENDPOINT: str({
    desc: "Custom S3 endpoint URL (for S3-compatible services like MinIO or S3Mock)",
    default: "",
    example: "http://localhost:9090",
  }),
  RECAPTCHA_SECRET_KEY: str({
    desc: "Secret key for Google reCAPTCHA verification",
    default: "",
  }),
  // File upload size limits (in MB)
  UPLOAD_LIMIT_BACKGROUND_MB: num({
    desc: "Maximum file size in MB for background uploads",
    default: 5,
    example: "5",
  }),
  UPLOAD_LIMIT_IMAGE_MB: num({
    desc: "Maximum file size in MB for image uploads",
    default: 2,
    example: "2",
  }),
  UPLOAD_LIMIT_VIDEO_MB: num({
    desc: "Maximum file size in MB for video uploads",
    default: 10,
    example: "10",
  }),
  UPLOAD_LIMIT_PROFILE_PHOTO_MB: num({
    desc: "Maximum file size in MB for profile photo uploads",
    default: 1,
    example: "1",
  }),
  UPLOAD_LIMIT_COLLECTION_THUMBNAIL_MB: num({
    desc: "Maximum file size in MB for collection thumbnail uploads",
    default: 2,
    example: "2",
  }),
});
