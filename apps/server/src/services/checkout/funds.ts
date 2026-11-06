/**
 * A short balance on the pay sheet (Build Board #49, PR CK-3; docs/features/mobile-checkout.md 8).
 *
 * Add USDC in Wallet opens Buy USDC with the intent. The intent moves to awaiting_funds so
 * the resume bar and the board can tell a fan who went to buy USDC from one who left. Nothing
 * about the balance is stored here: the pay sheet reads the balance from chain on return.
 */
import { prisma } from "@repo/database";
import type { CheckoutStatus } from "@repo/constants";
import { effectiveStatus, hexToIntentId, intentIdToHex, notFound } from "./intents";

export async function awaitFunds(
  viewerUserId: number,
  idHex: string,
  now: Date = new Date()
): Promise<{ id: string; status: CheckoutStatus }> {
  const row = await prisma.checkoutIntent.findUnique({
    where: { id: hexToIntentId(idHex) },
    select: { id: true, userId: true, status: true, expiresAt: true },
  });
  // Only the fan who claimed the intent; anyone else gets the same not found
  if (!row || row.userId !== viewerUserId) throw notFound();
  const status = effectiveStatus(row, now);
  if (status === "expired") throw notFound();
  if (status !== "open") return { id: intentIdToHex(row.id), status };
  // Conditional on the status: a concurrent request that moved the intent on first (CK-5
  // signing or submitted, or paid) is never overwritten
  const { count } = await prisma.checkoutIntent.updateMany({
    where: { id: row.id, status: "open", expiresAt: { gt: now } },
    data: { status: "awaiting_funds" },
  });
  if (count === 1) return { id: intentIdToHex(row.id), status: "awaiting_funds" };
  const current = await prisma.checkoutIntent.findUnique({
    where: { id: row.id },
    select: { status: true, expiresAt: true },
  });
  const latest = current ? effectiveStatus(current, now) : "expired";
  if (latest === "expired") throw notFound();
  return { id: intentIdToHex(row.id), status: latest };
}
