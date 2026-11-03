import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Field encryption at rest with AES-256-GCM. One scheme for every purpose, each under
 * its own derived key so the secrets rotate independently (Amped Messages, Build Board
 * #2 r4, spec 4.4).
 *
 * Format: v1.<iv base64>.<auth tag base64>.<ciphertext base64>
 */

const VERSION = "v1";

export interface SecretBox {
  encrypt(plaintext: string | null | undefined): string | null;
  decrypt(payload: string | null | undefined): string | null;
}

/**
 * @param purpose a fixed label mixed into the key ("direct-message")
 * @param secret  returns the configured secret at call time, so tests can change env
 * @param label   names the key in the decrypt failure log
 */
export function createSecretBox(purpose: string, secret: () => string, label: string): SecretBox {
  const key = () => createHash("sha256").update(`${purpose}:${secret()}`).digest();
  return {
    encrypt(plaintext) {
      if (plaintext === null || plaintext === undefined || plaintext === "") return null;
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key(), iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [
        VERSION,
        iv.toString("base64"),
        tag.toString("base64"),
        ciphertext.toString("base64"),
      ].join(".");
    },
    decrypt(payload) {
      if (!payload) return null;
      const [version, iv, tag, ciphertext] = payload.split(".");
      if (version !== VERSION || !iv || !tag || !ciphertext) return null;
      try {
        const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
        decipher.setAuthTag(Buffer.from(tag, "base64"));
        return Buffer.concat([
          decipher.update(Buffer.from(ciphertext, "base64")),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        console.error(`[crypto] Failed to decrypt a stored field. Was ${label} rotated?`);
        return null;
      }
    },
  };
}
