import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma, type Prisma } from "@repo/database";
import { broadcastPlainText } from "@repo/constants";
import { privateProcedure, router } from "../trpc";
import { checkReportThreshold } from "../../services/broadcast";
import { avatarUrl, creatorSelect } from "./shared";

/** A member reads a broadcast only through their own delivery row (section 3.7). */
const VISIBLE: Prisma.BroadcastWhereInput = { status: { in: ["SENDING", "SENT"] } };

async function mutedCreatorIds(userId: number) {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId, creatorUserId: { gt: 0 }, mutedUntil: { gt: new Date() } },
    select: { creatorUserId: true },
  });
  return rows.map(r => r.creatorUserId);
}

/**
 * broadcast.inbox: the fan Inbox. Scoped to ctx.user.sub. Every member gets
 * the inbox copy; email arrives in phase 2.
 */
export const broadcastInboxRouter = router({
  list: privateProcedure
    .input(
      z.object({
        filter: z.enum(["all", "unread"]).default("all"),
        creatorUserId: z.number().int().optional(),
        cursor: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const take = 30;
      const rows = await prisma.broadcastDelivery.findMany({
        where: {
          userId,
          archivedAt: null,
          readAt: input.filter === "unread" ? null : undefined,
          broadcast: { ...VISIBLE, creatorUserId: input.creatorUserId },
          id: input.cursor ? { lt: input.cursor } : undefined,
        },
        orderBy: { id: "desc" },
        take: take + 1,
        select: {
          id: true,
          readAt: true,
          createdAt: true,
          broadcast: {
            select: {
              id: true,
              title: true,
              body: true,
              creator: { select: creatorSelect },
              pool: { select: { name: true } },
            },
          },
        },
      });
      const muted = new Set(await mutedCreatorIds(userId));
      const items = rows.slice(0, take).map(d => ({
        deliveryId: d.id,
        broadcastId: d.broadcast.id,
        title: d.broadcast.title,
        preview: broadcastPlainText(d.broadcast.body).slice(0, 160),
        unread: !d.readAt,
        deliveredAt: d.createdAt,
        poolName: d.broadcast.pool?.name ?? null,
        muted: muted.has(d.broadcast.creator.id),
        creator: {
          id: d.broadcast.creator.id,
          name: d.broadcast.creator.name,
          handle: d.broadcast.creator.handle,
          avatar: avatarUrl(d.broadcast.creator),
        },
      }));
      return { items, nextCursor: rows.length > take ? items[items.length - 1]!.deliveryId : null };
    }),

  /** Creators with at least one message in the inbox, for the filter chips. */
  creators: privateProcedure.query(async ({ ctx }) => {
    const rows = await prisma.broadcast.findMany({
      where: { ...VISIBLE, deliveries: { some: { userId: ctx.user!.sub, archivedAt: null } } },
      distinct: ["creatorUserId"],
      select: { creator: { select: { id: true, name: true } } },
      take: 20,
    });
    return rows.map(r => r.creator);
  }),

  /** Full message. Marks it read. */
  get: privateProcedure
    .input(z.object({ broadcastId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const d = await prisma.broadcastDelivery.findFirst({
        where: { userId, broadcastId: input.broadcastId, broadcast: VISIBLE },
        select: {
          id: true,
          readAt: true,
          createdAt: true,
          broadcast: {
            select: {
              id: true,
              title: true,
              body: true,
              creator: { select: creatorSelect },
              pool: { select: { name: true } },
              reports: { where: { reporterUserId: userId }, select: { id: true } },
            },
          },
        },
      });
      if (!d)
        throw new TRPCError({ code: "NOT_FOUND", message: "This message is not in your inbox." });
      if (!d.readAt) {
        await prisma.broadcastDelivery.update({
          where: { id: d.id },
          data: { readAt: new Date() },
        });
      }
      const pref = await prisma.notificationPreference.findUnique({
        where: { userId_creatorUserId: { userId, creatorUserId: d.broadcast.creator.id } },
        select: { mutedUntil: true },
      });
      const mutedUntil = pref?.mutedUntil && pref.mutedUntil > new Date() ? pref.mutedUntil : null;
      return {
        broadcastId: d.broadcast.id,
        title: d.broadcast.title,
        body: d.broadcast.body,
        deliveredAt: d.createdAt,
        poolName: d.broadcast.pool?.name ?? null,
        reported: d.broadcast.reports.length > 0,
        mutedUntil,
        creator: {
          id: d.broadcast.creator.id,
          name: d.broadcast.creator.name,
          handle: d.broadcast.creator.handle,
          avatar: avatarUrl(d.broadcast.creator),
        },
      };
    }),

  /** Unread messages from creators that are not muted. Muted messages still arrive, without a badge. */
  unreadCount: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.sub;
    const muted = await mutedCreatorIds(userId);
    const count = await prisma.broadcastDelivery.count({
      where: {
        userId,
        readAt: null,
        archivedAt: null,
        broadcast: { ...VISIBLE, creatorUserId: muted.length ? { notIn: muted } : undefined },
      },
    });
    return { count };
  }),

  markAllRead: privateProcedure.mutation(async ({ ctx }) => {
    await prisma.broadcastDelivery.updateMany({
      where: { userId: ctx.user!.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }),

  archive: privateProcedure
    .input(z.object({ broadcastId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.broadcastDelivery.updateMany({
        where: { userId: ctx.user!.sub, broadcastId: input.broadcastId },
        data: { archivedAt: new Date() },
      });
      return { ok: true };
    }),

  /** One report per member per broadcast (acceptance 14). */
  report: privateProcedure
    .input(
      z.object({
        broadcastId: z.number().int(),
        reason: z.enum(["FINANCIAL_PROMISE", "SPAM", "HARASSMENT", "OTHER"]),
        note: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.sub;
      const delivered = await prisma.broadcastDelivery.findFirst({
        where: { userId, broadcastId: input.broadcastId },
        select: { id: true },
      });
      if (!delivered)
        throw new TRPCError({ code: "NOT_FOUND", message: "This message is not in your inbox." });
      await prisma.broadcastReport.upsert({
        where: {
          broadcastId_reporterUserId: { broadcastId: input.broadcastId, reporterUserId: userId },
        },
        create: {
          broadcastId: input.broadcastId,
          reporterUserId: userId,
          reason: input.reason,
          note: input.note || null,
        },
        update: {},
      });
      await checkReportThreshold(input.broadcastId);
      return { ok: true };
    }),

  /** Mute a creator for 30 days: messages still arrive, without a badge. */
  mute: privateProcedure
    .input(
      z.object({ creatorUserId: z.number().int().positive(), days: z.literal(30).default(30) })
    )
    .mutation(async ({ ctx, input }) => {
      const mutedUntil = new Date(Date.now() + input.days * 24 * 3600 * 1000);
      await prisma.notificationPreference.upsert({
        where: {
          userId_creatorUserId: { userId: ctx.user!.sub, creatorUserId: input.creatorUserId },
        },
        create: { userId: ctx.user!.sub, creatorUserId: input.creatorUserId, mutedUntil },
        update: { mutedUntil },
      });
      return { mutedUntil };
    }),

  unmute: privateProcedure
    .input(z.object({ creatorUserId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.notificationPreference.updateMany({
        where: { userId: ctx.user!.sub, creatorUserId: input.creatorUserId },
        data: { mutedUntil: null },
      });
      return { ok: true };
    }),
});
