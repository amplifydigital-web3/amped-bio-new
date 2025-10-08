import crypto from "crypto";

// Helper function to hash refresh tokens with SHA-256
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
