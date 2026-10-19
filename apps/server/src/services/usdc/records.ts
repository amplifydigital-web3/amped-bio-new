import { prisma } from "@repo/database";

/**
 * USDC records for one account (spec 3.9 privacy, Build Board #5 USDC-6).
 * Answers an access or export request sent to privacy@amped.bio, and removes
 * the stored Coinbase token when an account closes. Wallet and transaction
 * records themselves are kept 5 years after an account closes (Privacy Policy
 * section 10); on chain records cannot be deleted by anyone.
 */

export async function usdcRecordsFor(userId: number) {
  const [user, sends, events, sessions, auth] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        handle: true,
        onramp_ref: true,
        usdc_wallet_seen_at: true,
        wallet: { select: { address: true } },
      },
    }),
    prisma.usdcSend.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.paymentEvent.findMany({
      where: {
        kind: "usdc_transfer",
        OR: [{ payerUserId: userId }, { payeeUserId: userId }],
      },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.onrampSession.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.onrampUserAuth.findUnique({
      where: { userId },
      select: { provider: true, createdAt: true, expiresAt: true },
    }),
  ]);
  if (!user) return null;
  const hex = (value: Uint8Array | null) => (value ? Buffer.from(value).toString("hex") : null);
  return {
    account: {
      handle: user.handle,
      walletAddress: user.wallet?.address ?? null,
      usdcFirstOpenedAt: user.usdc_wallet_seen_at?.toISOString() ?? null,
      // The opaque reference Amped.Bio sends Coinbase instead of your id or email
      coinbaseReference: user.onramp_ref,
    },
    usdcSends: sends.map(send => ({
      id: hex(send.id),
      createdAt: send.createdAt.toISOString(),
      chainId: send.chainId,
      from: send.fromAddress,
      to: send.toAddress,
      amountUnits: send.amount.toString(),
      status: send.status,
      txHash: send.txHash,
      failureCode: send.failureCode,
    })),
    usdcTransfers: events.map(event => ({
      id: hex(event.id),
      occurredAt: event.occurredAt.toISOString(),
      chainId: event.chainId,
      direction: event.payerUserId === userId ? "sent" : "received",
      from: event.fromAddress,
      to: event.toAddress,
      amountUnits: event.amount.toString(),
      kind: event.refType ?? event.kind,
      txHash: event.txHash,
    })),
    coinbasePurchases: sessions.map(session => ({
      id: hex(session.id),
      createdAt: session.createdAt.toISOString(),
      method: session.mode,
      status: session.status,
      paid: session.fiatAmount === null ? null : (session.fiatAmount / 100).toFixed(2),
      currency: session.fiatCurrency,
      usdcUnits: session.usdcAmount?.toString() ?? null,
      deliveredTo: session.destination,
      coinbaseOrder: session.sessionRef,
      txHash: session.txHash,
      failureCode: session.failureCode,
      sandbox: session.sandbox,
    })),
    // The token itself is never exported: it is Coinbase's credential, not your data
    coinbaseSignInKept: auth
      ? { since: auth.createdAt.toISOString(), until: auth.expiresAt.toISOString() }
      : null,
  };
}

/** Deletes the stored Coinbase token. A returning fan verifies with Coinbase again. */
export async function forgetCoinbaseToken(userId: number) {
  const result = await prisma.onrampUserAuth.deleteMany({ where: { userId } });
  return { deleted: result.count };
}
