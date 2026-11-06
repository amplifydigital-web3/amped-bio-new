/**
 * Store promoters (content PR 12, C12; content spec 3.9 Promoters, decisions 20 and 25).
 *
 * A creator gives an Amped.Bio account a code with a share of each sale. Store links carry
 * ?via={code}; checkout.start copies it onto the intent (CK-1) and the join sheet passes it
 * to memberships.join.prepare. At prepare, `resolvePromoter` adds one promoter row to the
 * signed split when the code is active, in scope, not expired, not the buyer's own and the
 * share still leaves the creator at the contract minimum. Anything else sells without a
 * promoter row: a bad or stale code never stops a sale.
 *
 * Refunds come from the creator's wallet and never pull a promoter share back (decision 25).
 * A code whose refunds pass promoter_refund_pause_rate of its sales in 30 days pauses for
 * the creator to review (`checkRefundPause`, called when a refund lands).
 *
 * Partner rows (admin set, with consent dates) are not built here: the performer release
 * (store policy 4.4) and the agency system (#38) set how partner rows work, and both are
 * still in spec.
 */
import crypto from "node:crypto";
import { getAddress, isAddress, isAddressEqual, type Address } from "viem";
import { prisma } from "@repo/database";
import {
  PROMOTER_CODE_GENERATED_LENGTH,
  PROMOTER_CODES_MAX,
  PROMOTER_REFUND_WINDOW_DAYS,
  AMPEDPAY_CONTRACT,
  bpsPercent,
  type PromoterCodeRow,
  type PromoterCodeStatus,
  type PromoterMineRow,
  type PromoterScope,
  type PromoterUpsertInput,
} from "@repo/constants";
import { SPLIT_ROLES } from "@repo/web3";
import { uuidv7 } from "../../utils/uuid-v7";
import { paymentSettings } from "../payments/settings";
import { ScreeningUnavailableError, screenAddress } from "../usdc/screen";

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");
const DAY_MS = 24 * 60 * 60 * 1000;
const BPS = 10_000;
/** Statuses that paid the promoter: a refund keeps the share where it went. */
const PAID_STATUSES = ["confirmed_soft", "confirmed", "refunded"] as const;
const MEMBER_PAID = ["active", "past_due", "canceled", "ended"] as const;
/** Newest first, as a page: ended codes accumulate and a promoter can hold codes from many creators. */
const LIST_LIMIT = 200;
/** No 0, O, 1 or I: codes are read aloud and typed from posts. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type PromoterErrorCode =
  | "promoter_not_found"
  | "promoter_self"
  | "promoter_no_wallet"
  | "code_taken"
  | "share_range"
  | "creator_floor"
  | "scope_not_yours"
  | "too_many"
  | "ended"
  | "expires_past"
  | "not_found";

export class PromoterError extends Error {
  constructor(
    readonly code: PromoterErrorCode,
    readonly detail: Record<string, string> = {}
  ) {
    super(code);
    this.name = "PromoterError";
  }
}

export function generateCode(length = PROMOTER_CODE_GENERATED_LENGTH): string {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** The share bounds the payment settings allow, and the room the creator floor leaves. */
async function shareBounds(now = new Date()) {
  const settings = await paymentSettings(now.getTime());
  const min = Math.max(1, settings.promoterShareMinBps);
  const max = settings.promoterShareMaxBps;
  // The contract keeps the creator at minCreatorBps; the code screen checks the current fee
  const floor = AMPEDPAY_CONTRACT.defaults.minCreatorBps;
  return { min, max, room: BPS - settings.platformFeeBps - floor };
}

/** Offer and plan ids the creator owns, so a scope never names another store's product. */
async function assertScopeOwned(creatorUserId: number, scope: PromoterScope) {
  if (scope === "all") return;
  const ids = scope.map(id => Buffer.from(id, "hex"));
  const [offers, plans] = await Promise.all([
    prisma.offer.count({
      where: { creatorUserId, merchantId: null, id: { in: ids }, status: { not: "archived" } },
    }),
    prisma.membershipPlan.count({ where: { creatorUserId, id: { in: ids } } }),
  ]);
  if (offers + plans !== scope.length) throw new PromoterError("scope_not_yours");
}

async function stats(codeIds: Buffer[], now: Date) {
  if (codeIds.length === 0)
    return new Map<string, { sales: number; earned: bigint; refunds: number }>();
  const since = new Date(now.getTime() - PROMOTER_REFUND_WINDOW_DAYS * DAY_MS);
  const [purchases, joins] = await Promise.all([
    prisma.purchase.findMany({
      where: { promoterCodeId: { in: codeIds }, status: { in: [...PAID_STATUSES] } },
      select: { promoterCodeId: true, amount: true, split: true, status: true, refundedAt: true },
    }),
    prisma.membership.findMany({
      where: { promoterCodeId: { in: codeIds }, status: { in: [...MEMBER_PAID] } },
      select: { promoterCodeId: true, pricePerPeriod: true, chargeCount: true, joinTable: true },
    }),
  ]);
  const out = new Map<string, { sales: number; earned: bigint; refunds: number }>();
  const entry = (id: Uint8Array) => {
    const key = hex(id);
    if (!out.has(key)) out.set(key, { sales: 0, earned: 0n, refunds: 0 });
    return out.get(key)!;
  };
  const promoterBps = (table: unknown) =>
    ((table as { recipients?: { bps: number; role: number }[] } | null)?.recipients ?? [])
      .filter(r => r.role === SPLIT_ROLES.promoter)
      .reduce((sum, r) => sum + r.bps, 0);
  for (const row of purchases) {
    const e = entry(row.promoterCodeId!);
    e.earned += (row.amount * BigInt(promoterBps(row.split))) / BigInt(BPS);
    if (row.status === "refunded") {
      if (row.refundedAt && row.refundedAt >= since) e.refunds += 1;
    } else {
      e.sales += 1;
    }
  }
  for (const row of joins) {
    const e = entry(row.promoterCodeId!);
    e.sales += 1;
    // Every charge, the join included, paid the stored promoter row
    e.earned +=
      ((row.pricePerPeriod * BigInt(promoterBps(row.joinTable))) / BigInt(BPS)) *
      BigInt(Math.max(row.chargeCount, 1));
  }
  return out;
}

function scopeOf(raw: unknown): PromoterScope {
  return Array.isArray(raw) ? (raw as string[]) : "all";
}

/** A code past its end date reads as ended, whatever the row says. */
function effectiveStatus(row: { status: string; expiresAt: Date | null }, now: Date) {
  if (row.status !== "ended" && row.expiresAt && row.expiresAt <= now) return "ended";
  return row.status as PromoterCodeStatus;
}

// ------------------------------------------------------------------ creator

export async function listCodes(
  creatorUserId: number,
  now = new Date()
): Promise<PromoterCodeRow[]> {
  const rows = await prisma.promoterCode.findMany({
    where: { creatorUserId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    include: { promoter: { select: { handle: true, name: true } } },
  });
  const counts = await stats(
    rows.map(r => Buffer.from(r.id)),
    now
  );
  return rows.map(row => {
    const s = counts.get(hex(row.id)) ?? { sales: 0, earned: 0n, refunds: 0 };
    return {
      id: hex(row.id),
      code: row.code,
      promoter: { handle: row.promoter.handle ?? "", name: row.promoter.name },
      bps: row.bps,
      scope: scopeOf(row.scope),
      status: effectiveStatus(row, now),
      pausedReason: (row.pausedReason as "creator" | "refunds" | null) ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      sales: s.sales,
      promoterEarned: s.earned.toString(),
      refunds30d: s.refunds,
    };
  });
}

/** Creates a code, or edits its share, scope or end date. A new share applies to new sales. */
export async function upsertCode(
  creatorUserId: number,
  input: PromoterUpsertInput,
  now = new Date()
): Promise<PromoterCodeRow> {
  const bounds = await shareBounds(now);
  if (input.bps < bounds.min || input.bps > bounds.max) {
    throw new PromoterError("share_range", {
      min: bpsPercent(bounds.min),
      max: bpsPercent(bounds.max),
    });
  }
  if (input.bps > bounds.room) throw new PromoterError("creator_floor");
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt <= now) throw new PromoterError("expires_past");
  await assertScopeOwned(creatorUserId, input.scope);

  if (input.id) {
    const row = await prisma.promoterCode.findUnique({
      where: { id: Buffer.from(input.id, "hex") },
    });
    if (!row || row.creatorUserId !== creatorUserId) throw new PromoterError("not_found");
    if (row.status === "ended") throw new PromoterError("ended");
    await prisma.promoterCode.update({
      where: { id: row.id },
      data: { bps: input.bps, scope: input.scope, expiresAt },
    });
    return (await listCodes(creatorUserId, now)).find(c => c.id === input.id)!;
  }

  const handle = (input.promoterHandle ?? "").replace(/^@/, "").toLowerCase();
  const promoter = handle
    ? await prisma.user.findFirst({
        where: { handle, block: "no" },
        select: { id: true, handle: true, wallet: { select: { address: true } } },
      })
    : null;
  if (!promoter) throw new PromoterError("promoter_not_found");
  if (promoter.id === creatorUserId) throw new PromoterError("promoter_self");
  if (!promoter.wallet?.address || !isAddress(promoter.wallet.address, { strict: false })) {
    throw new PromoterError("promoter_no_wallet");
  }
  const open = await prisma.promoterCode.count({
    where: { creatorUserId, status: { not: "ended" } },
  });
  if (open >= PROMOTER_CODES_MAX) throw new PromoterError("too_many");

  const id = uuidv7();
  const chosen = input.code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = chosen ?? generateCode();
    const taken = await prisma.promoterCode.findUnique({ where: { code }, select: { id: true } });
    if (taken) {
      if (chosen) throw new PromoterError("code_taken");
      continue;
    }
    try {
      await prisma.promoterCode.create({
        data: {
          id,
          creatorUserId,
          promoterUserId: promoter.id,
          code,
          bps: input.bps,
          scope: input.scope,
          expiresAt,
        },
      });
    } catch (error) {
      // Two creators raced for the same code: the unique index decides
      if ((error as { code?: string }).code === "P2002") {
        if (chosen) throw new PromoterError("code_taken");
        continue;
      }
      throw error;
    }
    await notifyPromoter(promoter.id, creatorUserId, id);
    return (await listCodes(creatorUserId, now)).find(c => c.id === hex(id))!;
  }
  throw new PromoterError("code_taken");
}

/** Pause, turn back on, or end. Ended is final; past an end date a code cannot turn back on. */
export async function setCodeStatus(
  creatorUserId: number,
  idHex: string,
  status: PromoterCodeStatus,
  now = new Date()
): Promise<PromoterCodeRow> {
  const row = await prisma.promoterCode.findUnique({ where: { id: Buffer.from(idHex, "hex") } });
  if (!row || row.creatorUserId !== creatorUserId) throw new PromoterError("not_found");
  if (effectiveStatus(row, now) === "ended" && status !== "ended") throw new PromoterError("ended");
  await prisma.promoterCode.update({
    where: { id: row.id },
    data:
      status === "ended"
        ? { status, endedAt: row.endedAt ?? now, pausedReason: null }
        : status === "paused"
          ? { status, pausedReason: "creator" }
          : { status, pausedReason: null },
  });
  return (await listCodes(creatorUserId, now)).find(c => c.id === idHex)!;
}

async function notifyPromoter(promoterUserId: number, creatorUserId: number, codeId: Buffer) {
  try {
    await prisma.notification.create({
      data: {
        id: uuidv7(),
        userId: promoterUserId,
        kind: "PROMOTER_CODE",
        actorId: creatorUserId,
        refId: codeId,
        groupKey: `promoter:${hex(codeId)}`,
      },
    });
  } catch (error) {
    // The code stands without the bell row
    console.warn(
      "[store] promoter notice not stored",
      error instanceof Error ? error.message : error
    );
  }
}

// ------------------------------------------------------------------ promoter

export async function listMine(
  promoterUserId: number,
  now = new Date()
): Promise<PromoterMineRow[]> {
  const rows = await prisma.promoterCode.findMany({
    where: { promoterUserId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    include: { creator: { select: { handle: true, name: true } } },
  });
  const counts = await stats(
    rows.map(r => Buffer.from(r.id)),
    now
  );
  return rows.map(row => {
    const s = counts.get(hex(row.id)) ?? { sales: 0, earned: 0n, refunds: 0 };
    const scope = scopeOf(row.scope);
    return {
      id: hex(row.id),
      code: row.code,
      creator: { handle: row.creator.handle ?? "", name: row.creator.name },
      bps: row.bps,
      scopeCount: scope === "all" ? "all" : scope.length,
      status: effectiveStatus(row, now),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      sales: s.sales,
      earned: s.earned.toString(),
    };
  });
}

// ------------------------------------------------------------------ attribution

export type AttributedPromoter = {
  codeId: Buffer;
  promoterUserId: number;
  handle: string;
  to: Address;
  bps: number;
};

/**
 * The promoter row for a sale or a join, or null to sell without one. Never throws for a
 * bad code: an unknown, paused, ended, expired, out of scope or self code simply attributes
 * nothing. `payer` is checked when known (prepare); the quote passes null.
 */
export async function resolvePromoter(input: {
  via: string | null | undefined;
  creatorUserId: number;
  /** Offer id or MembershipPlan id, as hex; null for a single content item */
  targetId: string | null;
  buyerUserId: number;
  payer: Address | null;
  platformFeeBps: number;
  minCreatorBps: number;
  now?: Date;
  /** Screen the promoter's wallet (prepare). The quote skips it */
  screen?: boolean;
}): Promise<AttributedPromoter | null> {
  const code = input.via?.trim().toUpperCase();
  if (!code || !/^[A-Z0-9]{4,16}$/.test(code)) return null;
  // Products and the plan only: a single content item has no store scope
  if (!input.targetId) return null;
  const now = input.now ?? new Date();
  const row = await prisma.promoterCode.findUnique({
    where: { code },
    include: { promoter: { select: { id: true, handle: true, block: true, wallet: true } } },
  });
  if (!row || row.creatorUserId !== input.creatorUserId) return null;
  if (effectiveStatus(row, now) !== "active") return null;
  const scope = scopeOf(row.scope);
  if (scope !== "all" && !scope.includes(input.targetId)) return null;
  // A promoter can't buy through their own code; a creator can't promote their own store
  if (row.promoterUserId === input.buyerUserId || row.promoterUserId === input.creatorUserId) {
    return null;
  }
  if (row.promoter.block !== "no") return null;
  const address = row.promoter.wallet?.address;
  if (!address || !isAddress(address, { strict: false })) return null;
  const to = getAddress(address);
  if (input.payer && isAddressEqual(to, input.payer)) return null;
  // The current settings may have narrowed since the code was made
  const settings = await paymentSettings(now.getTime());
  if (row.bps < settings.promoterShareMinBps || row.bps > settings.promoterShareMaxBps) return null;
  if (BPS - input.platformFeeBps - row.bps < input.minCreatorBps) return null;
  if (input.screen) {
    try {
      const screened = await screenAddress(to, "send_destination", input.buyerUserId);
      if (!screened.allowed) return null;
    } catch (error) {
      if (error instanceof ScreeningUnavailableError) return null;
      throw error;
    }
  }
  return {
    codeId: Buffer.from(row.id),
    promoterUserId: row.promoterUserId,
    handle: row.promoter.handle ?? "",
    to,
    bps: row.bps,
  };
}

/**
 * After a refund lands: pause the code when its refunds in the last 30 days pass the
 * promoter_refund_pause_rate of its sales in the same window (content spec 3.9).
 */
export async function checkRefundPause(codeId: Uint8Array, now = new Date()): Promise<boolean> {
  const row = await prisma.promoterCode.findUnique({ where: { id: Buffer.from(codeId) } });
  if (!row || row.status !== "active") return false;
  const since = new Date(now.getTime() - PROMOTER_REFUND_WINDOW_DAYS * DAY_MS);
  const [sold, refunded] = await Promise.all([
    prisma.purchase.count({
      where: {
        promoterCodeId: Buffer.from(codeId),
        status: { in: [...PAID_STATUSES] },
        createdAt: { gte: since },
      },
    }),
    prisma.purchase.count({
      where: {
        promoterCodeId: Buffer.from(codeId),
        status: "refunded",
        refundedAt: { gte: since },
      },
    }),
  ]);
  if (sold === 0) return false;
  const settings = await paymentSettings(now.getTime());
  if (refunded * BPS <= sold * settings.promoterRefundPauseRateBps) return false;
  await prisma.promoterCode.updateMany({
    where: { id: row.id, status: "active" },
    data: { status: "paused", pausedReason: "refunds" },
  });
  console.info("[store] promoter code paused for refunds", JSON.stringify({ sold, refunded }));
  return true;
}
