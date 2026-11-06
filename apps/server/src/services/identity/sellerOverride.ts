import { prisma } from "@repo/database";
import {
  SELLER_OVERRIDE_MAX_DAYS,
  SELLER_OVERRIDE_REMINDER_MS,
  type IdentityCheckResult,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { deliverEmail } from "../../utils/email/transport";
import { isFeatureOn } from "../featureFlags";

/**
 * Seller tier (Build Board #66, AB-6; docs/features/authbase-storefront.md 3.2b, decision M10).
 *
 * Creators need an Enhanced Authbase check to sell. An Amped.Bio admin can allow a named
 * creator to sell with Standard until a date, with a reason, under two factor (checked by the
 * router), logged in the payments change log. The override ends at its date or when the
 * Authbase verification ends, whichever is first. The rule is off until the
 * sellerRequiresEnhanced flag is on, so turning it on is a deliberate step (open question 8).
 */

export class SellerOverrideError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function activeSellerOverride(userId: number, now = new Date()) {
  return prisma.sellerOverride.findFirst({
    where: { userId, revokedAt: null, endsAt: { gt: now } },
    orderBy: { endsAt: "desc" },
    select: { id: true, endsAt: true, reason: true, createdById: true },
  });
}

/**
 * Applies the tier rule to a seller result computed from Authbase and the RNS binding. A pass on
 * ENHANCED stands. A pass on STANDARD stands only with an active override, and then lasts until
 * the earlier of the pass and the override. Never throws: a failed read refuses, like every
 * other seller failure.
 */
export async function applySellerTier(
  userId: number,
  result: IdentityCheckResult,
  now = new Date()
): Promise<IdentityCheckResult> {
  if (!result.pass || result.tier === "ENHANCED" || !isFeatureOn("sellerRequiresEnhanced")) {
    return result;
  }
  try {
    const override = await activeSellerOverride(userId, now);
    if (!override) return { pass: false, reason: "needs_enhanced" };
    const validUntil = override.endsAt < result.validUntil ? override.endsAt : result.validUntil;
    return { ...result, validUntil, overrideUntil: override.endsAt };
  } catch (err) {
    console.error("[identity] seller override read failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { pass: false, reason: "unavailable" };
  }
}

async function emailUser(userId: number, subject: string, line: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user?.email) return;
  try {
    await deliverEmail({
      to: [user.email],
      subject,
      html: `<p>${line}</p><p>Upgrade to Enhanced from the Identity tab of your RNS name in Wallet.</p>`,
    });
  } catch (error) {
    console.error("[identity] seller override email failed", error);
  }
}

export async function setSellerOverride(input: {
  adminUserId: number;
  userId: number;
  reason: string;
  endsAt: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (reason.length < 3) throw new SellerOverrideError("Give a reason another admin can check.");
  if (Number.isNaN(input.endsAt.getTime()) || input.endsAt <= now) {
    throw new SellerOverrideError("Pick an end date in the future.");
  }
  if (input.endsAt.getTime() - now.getTime() > SELLER_OVERRIDE_MAX_DAYS * DAY_MS) {
    throw new SellerOverrideError(`An override lasts at most ${SELLER_OVERRIDE_MAX_DAYS} days.`);
  }
  if (input.adminUserId === input.userId) {
    throw new SellerOverrideError("You can't set an override on your own account.");
  }
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!user) throw new SellerOverrideError("No account with that id.");

  const row = await prisma.$transaction(async tx => {
    // One active override per account: a new one replaces the current one
    await tx.sellerOverride.updateMany({
      where: { userId: input.userId, revokedAt: null, endsAt: { gt: now } },
      data: { revokedAt: now, revokedById: input.adminUserId },
    });
    const created = await tx.sellerOverride.create({
      data: {
        id: uuidv7(),
        userId: input.userId,
        reason,
        endsAt: input.endsAt,
        createdById: input.adminUserId,
      },
    });
    await tx.adminChange.create({
      data: {
        id: uuidv7(),
        area: "identity",
        target: "server",
        key: `seller_override:${input.userId}`,
        oldValue: "",
        newValue: input.endsAt.toISOString(),
        reason,
        status: "applied",
        draftedById: input.adminUserId,
        approvedById: input.adminUserId,
        createdAt: now,
        decidedAt: now,
        appliedAt: now,
      },
    });
    return created;
  });
  await emailUser(
    input.userId,
    "You can sell with your Standard check for now",
    `Amped.Bio allowed your account to sell and get paid with a Standard check until ${input.endsAt.toUTCString()}. After that date selling needs an Enhanced check.`
  );
  return row;
}

export async function revokeSellerOverride(input: {
  adminUserId: number;
  userId: number;
  reason: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (reason.length < 3) throw new SellerOverrideError("Give a reason another admin can check.");
  const ended = await prisma.sellerOverride.updateMany({
    where: { userId: input.userId, revokedAt: null, endsAt: { gt: now } },
    data: { revokedAt: now, revokedById: input.adminUserId, endedNoticeAt: now },
  });
  if (ended.count === 0) throw new SellerOverrideError("This account has no active override.");
  await prisma.adminChange.create({
    data: {
      id: uuidv7(),
      area: "identity",
      target: "server",
      key: `seller_override:${input.userId}`,
      oldValue: "active",
      newValue: "ended",
      reason,
      status: "applied",
      draftedById: input.adminUserId,
      approvedById: input.adminUserId,
      createdAt: now,
      decidedAt: now,
      appliedAt: now,
    },
  });
  await emailUser(
    input.userId,
    "Selling with Standard has ended",
    "Amped.Bio ended the override on your account. Selling and getting paid now need an Enhanced check."
  );
}

/** The admin Users, Seller check panel (board a2). */
export async function sellerOverrideView(userId: number, now = new Date()) {
  const rows = await prisma.sellerOverride.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return {
    ruleOn: isFeatureOn("sellerRequiresEnhanced"),
    active:
      rows
        .filter(r => !r.revokedAt && r.endsAt > now)
        .map(r => ({
          endsAt: r.endsAt.toISOString(),
          reason: r.reason,
          createdById: r.createdById,
        }))[0] ?? null,
    history: rows.map(r => ({
      endsAt: r.endsAt.toISOString(),
      reason: r.reason,
      createdById: r.createdById,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Daily: a reminder 7 days before an override ends, and a notice when it has ended. Each email
 * goes once (reminderSentAt, endedNoticeAt).
 */
export async function sweepSellerOverrides(now = new Date()): Promise<number> {
  let sent = 0;
  const soon = await prisma.sellerOverride.findMany({
    where: {
      revokedAt: null,
      reminderSentAt: null,
      endsAt: { gt: now, lte: new Date(now.getTime() + SELLER_OVERRIDE_REMINDER_MS) },
    },
    take: 100,
  });
  for (const row of soon) {
    const claimed = await prisma.sellerOverride.updateMany({
      where: { id: row.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count !== 1) continue;
    await emailUser(
      row.userId,
      "Selling with Standard ends in 7 days",
      `Your account can sell with a Standard check until ${row.endsAt.toUTCString()}. Upgrade to Enhanced before then to keep getting paid.`
    );
    sent += 1;
  }
  const ended = await prisma.sellerOverride.findMany({
    where: { revokedAt: null, endedNoticeAt: null, endsAt: { lte: now } },
    take: 100,
  });
  for (const row of ended) {
    const claimed = await prisma.sellerOverride.updateMany({
      where: { id: row.id, endedNoticeAt: null },
      data: { endedNoticeAt: now },
    });
    if (claimed.count !== 1) continue;
    await emailUser(
      row.userId,
      "Selling with Standard has ended",
      "Your override has ended. Selling and getting paid now need an Enhanced check."
    );
    sent += 1;
  }
  return sent;
}

let sweeper: NodeJS.Timeout | null = null;

/** Started from bootstrap.ts. Runs every 6 hours; the flag is read on every run. */
export function startSellerOverrideSweeper() {
  if (sweeper || process.env.NODE_ENV === "test") return;
  const run = () => {
    if (!isFeatureOn("sellerRequiresEnhanced")) return;
    void sweepSellerOverrides().catch(error =>
      console.error("[identity] override sweep failed", error)
    );
  };
  setTimeout(run, 90_000);
  sweeper = setInterval(run, 6 * 60 * 60 * 1000);
  sweeper.unref();
}
