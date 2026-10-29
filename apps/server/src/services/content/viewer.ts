/**
 * Loading an item for someone who wants to open it (Build Board #20, spec 3.6).
 * Shared by content.getReadUrl and the progress router so both refuse the same
 * items. Anything a viewer may not open reads as NOT_FOUND, so ids cannot be
 * probed.
 */
import { TRPCError } from "@trpc/server";
import { prisma } from "@repo/database";
import type { Request } from "express";
import { hitRateLimit } from "../../utils/rateLimit";
import { getVisitorIp } from "../analytics/visitorIp";
import { isPublicItem, openDecision, servedAssetsClean } from "./access";
import type { DeliveryAccess } from "./delivery";

export const VIEWER_MESSAGES = {
  notFound: "This item is not available.",
  rate: "Too many requests. Try again in a minute.",
} as const;

/** Reads (read URLs, previews, reports) per viewer per minute (spec 3.10). */
export const READS_PER_MINUTE = 30;

type Ctx = { user?: { sub: number } | null; req?: Request };

export function viewerUserId(ctx: Ctx): number | null {
  return ctx.user?.sub ?? null;
}

/** A stable rate limit key: the account when signed in, otherwise the IP. */
export function viewerKey(ctx: Ctx): string {
  const userId = viewerUserId(ctx);
  if (userId !== null) return `u:${userId}`;
  const ip = ctx.req ? getVisitorIp(ctx.req).ip : "";
  return `ip:${ip || "unknown"}`;
}

export async function limitViewerReads(ctx: Ctx, scope = "content-read"): Promise<void> {
  if ((await hitRateLimit(`${scope}:${viewerKey(ctx)}`, 60)) > READS_PER_MINUTE) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: VIEWER_MESSAGES.rate });
  }
}

/**
 * The item, its assets and how the viewer opens it. Throws NOT_FOUND when the
 * viewer may not open it, or when a served asset has not passed its scan.
 */
export async function loadItemForViewer(publicId: string, userId: number | null) {
  const item = await prisma.contentItem.findUnique({
    where: { publicId },
    include: { user: { select: { page_status: true, block: true, handle: true, name: true } } },
  });
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: VIEWER_MESSAGES.notFound });
  const decision = openDecision(item, item.user, { userId });
  if (!decision) throw new TRPCError({ code: "NOT_FOUND", message: VIEWER_MESSAGES.notFound });
  const assets = await prisma.contentAsset.findMany({ where: { contentItemId: item.id } });
  if (!servedAssetsClean(assets)) {
    throw new TRPCError({ code: "NOT_FOUND", message: VIEWER_MESSAGES.notFound });
  }
  // An owner previewing their own public item gets the public lifetimes
  const access: DeliveryAccess = isPublicItem(item, item.user) ? "public" : "private";
  return { item, assets, decision, access };
}
