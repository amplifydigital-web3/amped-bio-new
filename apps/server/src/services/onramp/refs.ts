import { randomBytes } from "node:crypto";
import { prisma } from "@repo/database";
import { env } from "../../env";

/**
 * partnerUserRef (spec 3.5): an opaque per user id Coinbase stores with every
 * transaction, so the Transaction Status API can find the fan's purchases. It
 * is ob_ plus 16 random characters, never the user id or email. On sandbox it
 * carries the sandbox- prefix, which makes Coinbase run a test transaction.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export const SANDBOX_PREFIX = "sandbox-";

export function newOnrampRef(): string {
  const bytes = randomBytes(16);
  let out = "ob_";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** The fan's stored ref, created on first use. */
export async function onrampRefFor(userId: number): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onramp_ref: true },
  });
  if (user?.onramp_ref) return user.onramp_ref;
  // Two tabs can race here: only the first write lands, both read it back
  await prisma.user.updateMany({
    where: { id: userId, onramp_ref: null },
    data: { onramp_ref: newOnrampRef() },
  });
  const stored = await prisma.user.findUnique({
    where: { id: userId },
    select: { onramp_ref: true },
  });
  if (!stored?.onramp_ref) throw new Error("onramp ref was not stored");
  return stored.onramp_ref;
}

/** The value sent to Coinbase for this environment. */
export async function partnerUserRefFor(userId: number): Promise<string> {
  const ref = await onrampRefFor(userId);
  return env.ONRAMP_SANDBOX ? `${SANDBOX_PREFIX}${ref}` : ref;
}
