import "express-async-errors";
import { generateKeyPairSync } from "crypto";

// ──────────────────────────────────────────────
// Test environment variables — set before any import that reads `env`
// ──────────────────────────────────────────────
process.env.APP_ENV = "testing";

// Generate a real RSA key at module load time so auth.ts's top-level
// crypto.createPrivateKey() call does not throw.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
process.env.JWT_PRIVATE_KEY = privateKey;

process.env.JWT_AUDIENCE = "test-amped-bio";
process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-min-32-chars!!";
process.env.BETTER_AUTH_URL = "http://localhost:43000";
process.env.APP_URL = "http://localhost:5173";
process.env.LANDINGPAGE_URL = "http://localhost:3000";
process.env.CORS_ORIGINS = "http://localhost:5173,http://localhost:3000";
process.env.MCP_RESOURCE_URL = "https://api.test.amped.bio/mcp";
process.env.OAUTH_TRUSTED_CLIENT_IDS = "trusted-client-1,trusted-client-2";
process.env.API_HOST = "localhost:43000";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "1025";
process.env.AWS_REGION = "us-east-1";
process.env.AWS_ACCESS_KEY_ID = "test";
process.env.AWS_SECRET_ACCESS_KEY = "test";

// Database connection for tests that import auth.ts (which creates Prisma client)
process.env.DATABASE_URL = "mysql://amped_user:amped_password@localhost:23306/amped_bio";