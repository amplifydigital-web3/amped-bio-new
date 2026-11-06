import { env } from "../../env";
import { createSecretBox } from "../crypto/secretBox";

/**
 * Messaging on Telegram (Build Board #2), spec 3.9: `username`, `firstName` and
 * `photoUrl` on telegram_accounts are encrypted at rest with AES-256-GCM. The scheme
 * now lives in services/crypto/secretBox.ts; the key derivation is unchanged, so
 * stored values still decrypt. Removed with Telegram in PR M8.
 */
const box = createSecretBox(
  "telegram-account",
  () => env.TELEGRAM_SECRET_BOX_KEY || env.BETTER_AUTH_SECRET,
  "TELEGRAM_SECRET_BOX_KEY"
);

export const encryptTelegramField = box.encrypt;
export const decryptTelegramField = box.decrypt;
