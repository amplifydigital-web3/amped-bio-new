import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../env";

/**
 * Messaging on Telegram (Build Board #2), spec 3.9: `username`, `firstName` and
 * `photoUrl` on telegram_accounts are encrypted at rest with AES-256-GCM, the same
 * shape as services/analytics/secretBox.ts but under its own key so the two secrets
 * rotate independently.
 * Format: v1.<iv base64>.<auth tag base64>.<ciphertext base64>
 */

const VERSION = "v1";

function getKey(): Buffer {
  const secret = env.TELEGRAM_SECRET_BOX_KEY || env.BETTER_AUTH_SECRET;
  return createHash("sha256").update(`telegram-account:${secret}`).digest();
}

export function encryptTelegramField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptTelegramField(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    console.error(
      "[telegram] Failed to decrypt a stored field. Was TELEGRAM_SECRET_BOX_KEY rotated?"
    );
    return null;
  }
}
