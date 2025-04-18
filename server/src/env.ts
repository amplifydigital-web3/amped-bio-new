import { cleanEnv, str, port, bool } from "envalid";

export const env = cleanEnv(process.env, {
  JWT_SECRET: str({
    desc: "Secret key for JWT token generation and verification",
    default: "your-default-jwt-secret-for-development",
  }),
  PORT: port({
    desc: "Port for the server to listen on",
    default: 43000,
  }),
  VERCEL_PROJECT_PRODUCTION_URL: str({
    desc: "URL for the site in production",
    default: "http://localhost:5173",
    example: "https://yourdomain.com",
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
    default: "noreply@amped-bio.com",
    example: "noreply@yourdomain.com",
  }),
});
