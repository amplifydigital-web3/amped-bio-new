import { prisma } from "@repo/database";
import { type OnrampMode, type OnrampStatus } from "@repo/constants";
import { env } from "../../env";
import { paymentChain } from "../usdc/chain";
import { fromCents } from "./amounts";
import { isOnrampConfigured } from "./coinbase";
import { onrampPausedSetting } from "./pause";
import { PROVIDER } from "./sessions";

export { onrampPausedSetting, setOnrampPaused } from "./pause";

/**
 * Admin, Money, Buy USDC (Build Board #5 USDC-6, spec 3.8). On-ramp sessions
 * by status for the last 7 days with failure codes, the webhook log, and the
 * Pause Buy USDC switch. Handles only, never fan email, names or the opaque
 * Coinbase reference.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUSES: OnrampStatus[] = [
  "created",
  "pending_verification",
  "pending_payment",
  "processing",
  "success",
  "failed",
  "canceled",
  "expired",
];

export async function onrampOverview(now = new Date()) {
  const week = new Date(now.getTime() - 7 * DAY_MS);
  const where = { provider: PROVIDER, chainId: paymentChain.id, createdAt: { gte: week } };
  const [paused, byStatus, byMode, bought, paidByCurrency, failures, lastEvent, eventErrors] =
    await Promise.all([
      onrampPausedSetting(),
      prisma.onrampSession.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.onrampSession.groupBy({ by: ["mode"], where, _count: { _all: true } }),
      // USDC units do not depend on the fiat currency, so one sum is enough
      prisma.onrampSession.aggregate({
        where: { ...where, status: "success" },
        _sum: { usdcAmount: true },
      }),
      // Fiat amounts are minor units per currency: never add GBP and USD together
      prisma.onrampSession.groupBy({
        by: ["fiatCurrency"],
        where: { ...where, status: "success" },
        _sum: { fiatAmount: true },
      }),
      prisma.onrampSession.groupBy({
        by: ["failureCode"],
        where: { ...where, status: "failed" },
        _count: { _all: true },
      }),
      prisma.onrampEvent.findFirst({
        where: { provider: PROVIDER },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      }),
      prisma.onrampEvent.count({
        where: { provider: PROVIDER, receivedAt: { gte: week }, error: { not: null } },
      }),
    ]);

  const statusCounts = Object.fromEntries(STATUSES.map(status => [status, 0])) as Record<
    OnrampStatus,
    number
  >;
  for (const row of byStatus) {
    if (row.status in statusCounts) statusCounts[row.status as OnrampStatus] = row._count._all;
  }
  const modeCounts: Record<OnrampMode, number> = {
    coinbase_account: 0,
    apple_pay: 0,
    google_pay: 0,
  };
  for (const row of byMode) {
    if (row.mode in modeCounts) modeCounts[row.mode as OnrampMode] = row._count._all;
  }

  return {
    network: paymentChain.name,
    enabled: env.ONRAMP_ENABLED,
    configured: isOnrampConfigured(),
    webhookConfigured: Boolean(env.CDP_ONRAMP_WEBHOOK_SECRET),
    sandbox: env.ONRAMP_SANDBOX,
    paused,
    week: {
      total: Object.values(statusCounts).reduce((sum, count) => sum + count, 0),
      byStatus: statusCounts,
      byMode: modeCounts,
      // Minor units the fans paid Coinbase on successful purchases, per currency
      paid: paidByCurrency
        .map(row => ({
          currency: row.fiatCurrency ?? "USD",
          amount: fromCents(row._sum.fiatAmount ?? 0),
        }))
        .sort((a, b) => (a.currency < b.currency ? -1 : 1)),
      usdcUnits: (bought._sum.usdcAmount ?? 0n).toString(),
      failures: failures
        .map(row => ({ code: row.failureCode ?? "unknown", count: row._count._all }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    },
    webhook: {
      lastEventAt: lastEvent?.receivedAt.toISOString() ?? null,
      errorsThisWeek: eventErrors,
    },
  };
}

async function handles(userIds: number[]) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map<number, string | null>();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, handle: true },
  });
  return new Map(users.map(user => [user.id, user.handle]));
}

export async function onrampSessions(params: {
  status?: OnrampStatus;
  limit: number;
  before?: Date;
}) {
  const rows = await prisma.onrampSession.findMany({
    where: {
      provider: PROVIDER,
      chainId: paymentChain.id,
      ...(params.status ? { status: params.status } : {}),
      ...(params.before ? { createdAt: { lt: params.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: params.limit,
  });
  const names = await handles(rows.map(row => row.userId));
  return rows.map(row => ({
    id: Buffer.from(row.id).toString("hex"),
    createdAt: row.createdAt.toISOString(),
    handle: names.get(row.userId) ?? null,
    mode: row.mode as OnrampMode,
    status: row.status as OnrampStatus,
    fiatAmount: row.fiatAmount === null ? null : fromCents(row.fiatAmount),
    fiatCurrency: row.fiatCurrency,
    usdcUnits: row.usdcAmount?.toString() ?? null,
    orderRef: row.sessionRef,
    txHash: row.txHash,
    failureCode: row.failureCode,
    sandbox: row.sandbox,
  }));
}

/** The webhook log. The payload stays on the server; the admin sees type, result and session. */
export async function onrampEvents(limit: number) {
  const rows = await prisma.onrampEvent.findMany({
    where: { provider: PROVIDER },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
  return rows.map(row => ({
    id: Buffer.from(row.id).toString("hex"),
    receivedAt: row.receivedAt.toISOString(),
    eventId: row.eventId,
    eventType: row.eventType,
    sessionId: row.sessionId ? Buffer.from(row.sessionId).toString("hex") : null,
    processed: row.processedAt !== null,
    error: row.error,
  }));
}
