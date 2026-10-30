/**
 * Checkout intents (Build Board #49 Mobile checkout, PR CK-1; mobile first review R1).
 *
 * Buy on a public page creates the intent and navigates to app.amped.bio/pay/{id};
 * no wallet code ships on amped.bio pages. The intent survives sign up (the pay
 * URL is the sign in returnTo), the Wallet Buy USDC handoff and an app reload.
 *
 * Privacy: an intent is claimed by the first signed in fan who reads it. After
 * that only that fan sees what it is for. A signed out reader of a claimed
 * intent learns nothing (spec QA finding 11).
 */
import { prisma } from "@repo/database";
import {
  CHECKOUT_INTENT_TTL_MS,
  LIVE_CHECKOUT_KINDS,
  RESUMABLE_CHECKOUT_STATUSES,
  checkoutPayPath,
  type CheckoutStartInput,
  type CheckoutStatus,
} from "@repo/constants";
import { TRPCError } from "@trpc/server";
import { uuidv7 } from "../../utils/uuid-v7";

export const intentIdToHex = (id: Buffer | Uint8Array) => Buffer.from(id).toString("hex");
const hexToIntentId = (hex: string) => Buffer.from(hex, "hex");

const notFound = () =>
  new TRPCError({
    code: "NOT_FOUND",
    message: "This checkout has ended. Start again from the page.",
  });

export type CheckoutItem = { title: string; creatorHandle: string; creatorName: string };

/**
 * What can be bought today: a ready, published, cleared content item on a
 * published page whose account is not suspended. 18+ items wait for the Over 18
 * check before Pay (identity checks A1 and the CK-0 board c6).
 */
async function resolveTarget(
  target: CheckoutStartInput["target"]
): Promise<{ creatorUserId: number; item: CheckoutItem } | null> {
  if (target.type !== "content") return null;
  const item = await prisma.contentItem.findUnique({
    where: { publicId: target.id },
    select: {
      title: true,
      status: true,
      publishState: true,
      moderationState: true,
      adult: true,
      deletedAt: true,
      user: { select: { id: true, handle: true, name: true, block: true, page_status: true } },
    },
  });
  if (
    !item ||
    item.status !== "READY" ||
    item.publishState !== "PUBLISHED" ||
    item.moderationState !== "CLEAR" ||
    item.adult ||
    item.deletedAt !== null ||
    item.user.block !== "no" ||
    item.user.page_status !== "PUBLISHED" ||
    !item.user.handle
  ) {
    return null;
  }
  return {
    creatorUserId: item.user.id,
    item: { title: item.title, creatorHandle: item.user.handle, creatorName: item.user.name },
  };
}

export async function startIntent(viewerUserId: number | null, input: CheckoutStartInput) {
  if (!(LIVE_CHECKOUT_KINDS as readonly string[]).includes(input.kind)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This kind of checkout is not available yet.",
    });
  }
  const resolved = await resolveTarget(input.target);
  if (!resolved) throw new TRPCError({ code: "NOT_FOUND", message: "This item is not for sale." });
  if (viewerUserId !== null && viewerUserId === resolved.creatorUserId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You can't buy from your own page." });
  }
  const now = new Date();
  const id = uuidv7();
  await prisma.checkoutIntent.create({
    data: {
      id,
      kind: input.kind,
      targetType: input.target.type,
      targetId: input.target.id,
      creatorUserId: resolved.creatorUserId,
      userId: viewerUserId,
      claimedAt: viewerUserId !== null ? now : null,
      via: input.via ?? null,
      source: input.source,
      status: "open",
      expiresAt: new Date(now.getTime() + CHECKOUT_INTENT_TTL_MS),
    },
  });
  const hex = intentIdToHex(id);
  return { id: hex, payPath: checkoutPayPath(hex) };
}

type IntentRow = {
  id: Buffer | Uint8Array;
  kind: string;
  targetType: string;
  targetId: string;
  userId: number | null;
  status: string;
  expiresAt: Date;
};

/** An intent past its time reads as expired, and is stored so. Exported for tests. */
export function effectiveStatus(
  row: Pick<IntentRow, "status" | "expiresAt">,
  now: Date
): CheckoutStatus {
  if (row.status === "paid") return "paid";
  if (row.expiresAt <= now) return "expired";
  return row.status as CheckoutStatus;
}

/**
 * Reads an intent for the /pay page. The first signed in reader claims an
 * unclaimed intent. Anyone else gets NOT_FOUND; a signed out reader of an
 * unclaimed intent sees what it is for, so the page can ask them to sign in.
 */
export async function getIntent(viewerUserId: number | null, idHex: string) {
  const row = await prisma.checkoutIntent.findUnique({
    where: { id: hexToIntentId(idHex) },
    select: {
      id: true,
      kind: true,
      targetType: true,
      targetId: true,
      userId: true,
      status: true,
      expiresAt: true,
    },
  });
  if (!row) throw notFound();
  if (row.userId !== null && row.userId !== viewerUserId) {
    // Claimed by another account, or signed out: say nothing about it
    throw notFound();
  }

  const now = new Date();
  const status = effectiveStatus(row, now);
  if (status === "expired" && row.status !== "expired") {
    await prisma.checkoutIntent.update({ where: { id: row.id }, data: { status: "expired" } });
  }

  if (row.userId === null && viewerUserId !== null && status !== "expired") {
    // Claim once: only update a row that is still unclaimed
    const claimed = await prisma.checkoutIntent.updateMany({
      where: { id: row.id, userId: null },
      data: { userId: viewerUserId, claimedAt: now },
    });
    if (claimed.count === 0) {
      // Someone else claimed it between the read and the write
      const current = await prisma.checkoutIntent.findUnique({
        where: { id: row.id },
        select: { userId: true },
      });
      if (current?.userId !== viewerUserId) throw notFound();
    }
  }

  const resolved =
    status === "expired" ? null : await resolveTarget({ type: "content", id: row.targetId });
  return {
    id: intentIdToHex(row.id),
    kind: row.kind,
    // An item removed, unpublished or suspended since start cannot finish
    status: !resolved && status !== "paid" ? ("expired" as const) : status,
    expiresAt: row.expiresAt.toISOString(),
    signedIn: viewerUserId !== null,
    item: resolved?.item ?? null,
  };
}

/** The latest open intent for the resume bar, or null. */
export async function resumableIntent(viewerUserId: number) {
  const row = await prisma.checkoutIntent.findFirst({
    where: {
      userId: viewerUserId,
      status: { in: [...RESUMABLE_CHECKOUT_STATUSES] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, targetType: true, targetId: true },
  });
  if (!row) return null;
  const resolved = await resolveTarget({ type: "content", id: row.targetId });
  if (!resolved) return null;
  const hex = intentIdToHex(row.id);
  return { id: hex, title: resolved.item.title, payPath: checkoutPayPath(hex) };
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PURGE_MS = 6 * 60 * 60 * 1000;

/**
 * Privacy notice section 10: an intent is kept 30 days after it ends unless it
 * became a purchase. Returns the number deleted. Exported for tests.
 */
export async function purgeEndedIntents(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.checkoutIntent.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - RETENTION_MS) }, status: { not: "paid" } },
  });
  return count;
}

let purger: NodeJS.Timeout | null = null;
/** Every 6 hours. Runs whether or not CHECKOUT_ENABLED is on, so no row outlives the notice. */
export function startCheckoutIntentPurge() {
  if (purger || process.env.NODE_ENV === "test") return;
  const run = () =>
    void purgeEndedIntents()
      .then(count => {
        if (count) console.log(`[checkout] purged ${count} ended checkout intent(s)`);
      })
      .catch(error => console.error("[checkout] intent purge failed", error));
  setTimeout(run, 90_000);
  purger = setInterval(run, PURGE_MS);
  purger.unref();
}
