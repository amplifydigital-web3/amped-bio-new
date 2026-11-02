import { createHash, createHmac } from "node:crypto";
import { TELEGRAM_LINK_CODE_LENGTH, TELEGRAM_LINK_CODE_REGEX } from "@repo/constants";
import { env } from "../../env";

/**
 * Short creator codes for Telegram deep links (Build Board #2, spec r3 3.5, Telegram
 * Full QA 29 Oct F6). A payload is capped at 64 characters and handles can be 64, so
 * links carry `m_{code}`, `j_{code}` or `p_{code}` instead of the handle.
 *
 * A code is the user id run through a keyed four round Feistel permutation over 50
 * bits, written as 10 base36 characters. It is stable across handle changes, needs
 * no table and no migration, reveals nothing about the id without the key, and
 * decodes back to the id. Codes change only if TELEGRAM_SECRET_BOX_KEY (or its
 * BETTER_AUTH_SECRET fallback) rotates; links already shared would then stop
 * resolving and the bot answers dmNotFound.
 */

const HALF_BITS = 25n;
const HALF_MASK = (1n << HALF_BITS) - 1n;
const BLOCK = 1n << (HALF_BITS * 2n);
const MAX_USER_ID = (1n << 31n) - 1n;
const ROUNDS = 4;

function key(): Buffer {
  const secret = env.TELEGRAM_SECRET_BOX_KEY || env.BETTER_AUTH_SECRET;
  return createHash("sha256").update(`telegram-link-code:${secret}`).digest();
}

function round(k: Buffer, index: number, half: bigint): bigint {
  const mac = createHmac("sha256", k).update(`${index}:${half}`).digest();
  return BigInt(`0x${mac.subarray(0, 4).toString("hex")}`) & HALF_MASK;
}

function permute(value: bigint, inverse: boolean): bigint {
  const k = key();
  let left = value >> HALF_BITS;
  let right = value & HALF_MASK;
  if (!inverse) {
    for (let i = 0; i < ROUNDS; i++) [left, right] = [right, left ^ round(k, i, right)];
  } else {
    for (let i = ROUNDS - 1; i >= 0; i--) [left, right] = [right ^ round(k, i, left), left];
  }
  return (left << HALF_BITS) | right;
}

/** The user's code. Pure: the same user always gets the same code. */
export function encodeLinkCode(userId: number): string {
  const id = BigInt(userId);
  if (id < 0n || id > MAX_USER_ID) throw new Error("telegram link code: user id out of range");
  return permute(id, false).toString(36).padStart(TELEGRAM_LINK_CODE_LENGTH, "0");
}

/** The user id behind a code, or null for a malformed or forged code. */
export function decodeLinkCode(code: string): number | null {
  if (!TELEGRAM_LINK_CODE_REGEX.test(code)) return null;
  let value = 0n;
  for (const ch of code) value = value * 36n + BigInt(parseInt(ch, 36));
  if (value >= BLOCK) return null;
  const id = permute(value, true);
  return id > 0n && id <= MAX_USER_ID ? Number(id) : null;
}

/** Async wrappers keep call sites ready for a stored code later. */
export async function getOrCreateLinkCode(userId: number): Promise<string> {
  return encodeLinkCode(userId);
}

export async function userIdForLinkCode(code: string): Promise<number | null> {
  return decodeLinkCode(code);
}
