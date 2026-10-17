import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../env";

/**
 * Buy USDC through Coinbase (Build Board #5), spec decision 5 and 3.10. The
 * Coinbase userAuthToken for the Headless Onramp is stored encrypted at rest
 * with AES-256-GCM under its own key, the same shape as the Telegram secret box.
 * Format: v1.<iv base64>.<auth tag base64>.<ciphertext base64>
 */

const VERSION = "v1";

function getKey(): Buffer {
  const secret = env.ONRAMP_DATA_KEY || env.BETTER_AUTH_SECRET;
  return createHash("sha256").update(`onramp-user-auth:${secret}`).digest();
}

export function encryptOnrampToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptOnrampToken(payload: string | null | undefined): string | null {
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
      "[onramp] Failed to decrypt the stored Coinbase token. Was ONRAMP_DATA_KEY rotated?"
    );
    return null;
  }
}
