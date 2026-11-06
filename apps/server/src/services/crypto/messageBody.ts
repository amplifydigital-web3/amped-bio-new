import { env } from "../../env";
import { createSecretBox } from "./secretBox";

/**
 * Amped Messages (Build Board #2 r4, spec 4.4 and 6): direct message bodies and report
 * snapshots are encrypted at rest. Not end to end: the server decrypts to deliver and
 * admins read reported conversations only (msg-encryption).
 * Key: MESSAGES_SECRET_BOX_KEY, falling back to BETTER_AUTH_SECRET. Rotating it makes
 * stored messages unreadable, so it is set once per environment.
 */
const box = createSecretBox(
  "direct-message",
  () => env.MESSAGES_SECRET_BOX_KEY || env.BETTER_AUTH_SECRET,
  "MESSAGES_SECRET_BOX_KEY"
);

/** Encrypts a message body. An empty body stores as the empty string. */
export function encryptMessageBody(body: string): string {
  return box.encrypt(body) ?? "";
}

/** Decrypts a stored body. Returns null for a cleared or unreadable body. */
export function decryptMessageBody(stored: string | null | undefined): string | null {
  return box.decrypt(stored);
}
