import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma } from "@repo/database";
import { adminProcedure, router } from "../trpc";
import { idToHex, hexToId } from "../../services/analytics/ids";
import { threadMessages } from "../../services/messaging/views";
import { queueGroupCheck } from "../../services/telegram/groups";

const idSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .transform(hexToId);

const userSelect = { id: true, name: true, handle: true, email: true } as const;

/**
 * admin.telegram (Build Board #2, spec 3.4, tg9 row 120). Reports, paused senders, the
 * invite only pilot and bot health. Admins read a thread only once someone reported
 * it (spec 3.9: Amped does not scan private messages).
 */
export const telegramAdminRouter = router({
  listReports: adminProcedure
    .input(z.object({ resolved: z.boolean().default(false) }).default({}))
    .query(async ({ input }) => {
      const rows = await prisma.messageReport.findMany({
        where: { resolvedAt: input.resolved ? { not: null } : null },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          reporter: { select: userSelect },
          thread: {
            select: {
              id: true,
              status: true,
              creator: { select: userSelect },
              fan: { select: userSelect },
              _count: { select: { reports: true, messages: true } },
            },
          },
        },
      });
      return rows.map(row => ({
        id: idToHex(row.id),
        reason: row.reason,
        note: row.note,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt,
        messageId: row.messageId ? idToHex(row.messageId) : null,
        reporter: row.reporter,
        reporterSide: row.reporterUserId === row.thread.creator.id ? "creator" : "fan",
        thread: {
          id: idToHex(row.thread.id),
          status: row.thread.status,
          creator: row.thread.creator,
          fan: row.thread.fan,
          reports: row.thread._count.reports,
          messages: row.thread._count.messages,
        },
      }));
    }),

  /** A reported thread's messages. Refused for a thread nobody reported. */
  reportedThread: adminProcedure
    .input(
      z.object({
        threadId: idSchema,
        before: z
          .string()
          .regex(/^[0-9a-f]{32}$/)
          .nullish(),
      })
    )
    .query(async ({ input }) => {
      const reported = await prisma.messageReport.count({ where: { threadId: input.threadId } });
      if (reported === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only reported threads can be opened." });
      }
      return threadMessages(input.threadId, input.before);
    }),

  resolveReport: adminProcedure.input(z.object({ id: idSchema })).mutation(async ({ input }) => {
    await prisma.messageReport.update({
      where: { id: input.id },
      data: { resolvedAt: new Date() },
    });
    return { ok: true };
  }),

  /** Fans whose sending is paused and creators whose Fan messages are paused. */
  listPaused: adminProcedure.query(async () => {
    const now = new Date();
    const [fans, creators] = await Promise.all([
      prisma.messagingSenderStatus.findMany({
        where: {
          pausedAt: { not: null },
          OR: [{ pausedUntil: null }, { pausedUntil: { gt: now } }],
        },
        include: { user: { select: userSelect } },
        orderBy: { pausedAt: "desc" },
      }),
      prisma.creatorMessagingSettings.findMany({
        where: { pausedAt: { not: null } },
        include: { user: { select: userSelect } },
        orderBy: { pausedAt: "desc" },
      }),
    ]);
    return {
      fans: fans.map(row => ({
        user: row.user,
        pausedAt: row.pausedAt,
        pausedUntil: row.pausedUntil,
        reason: row.pausedReason,
      })),
      creators: creators.map(row => ({
        user: row.user,
        pausedAt: row.pausedAt,
        reason: row.pausedReason,
      })),
    };
  }),

  /** Pause a fan's sending (no end date) or a creator's Fan messages. */
  pauseSender: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        scope: z.enum(["fan", "creator"]),
        reason: z.string().trim().min(3).max(255),
      })
    )
    .mutation(async ({ input }) => {
      const now = new Date();
      if (input.scope === "fan") {
        await prisma.messagingSenderStatus.upsert({
          where: { userId: input.userId },
          create: {
            userId: input.userId,
            pausedAt: now,
            pausedUntil: null,
            pausedReason: input.reason,
          },
          update: { pausedAt: now, pausedUntil: null, pausedReason: input.reason },
        });
      } else {
        await prisma.creatorMessagingSettings.upsert({
          where: { userId: input.userId },
          create: { userId: input.userId, pausedAt: now, pausedReason: input.reason },
          update: { pausedAt: now, pausedReason: input.reason },
        });
      }
      return { ok: true };
    }),

  resumeSender: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), scope: z.enum(["fan", "creator"]) }))
    .mutation(async ({ input }) => {
      if (input.scope === "fan") {
        await prisma.messagingSenderStatus.updateMany({
          where: { userId: input.userId },
          data: { pausedAt: null, pausedUntil: null, pausedReason: null },
        });
      } else {
        await prisma.creatorMessagingSettings.updateMany({
          where: { userId: input.userId },
          data: { pausedAt: null, pausedReason: null },
        });
      }
      return { ok: true };
    }),

  /** MESSAGING_INVITE_ONLY pilot: creators who may turn Fan messages on. */
  listInvited: adminProcedure.query(async () => {
    const rows = await prisma.creatorMessagingSettings.findMany({
      where: { invitedAt: { not: null } },
      include: { user: { select: userSelect } },
      orderBy: { invitedAt: "desc" },
    });
    return rows.map(row => ({
      user: row.user,
      invitedAt: row.invitedAt,
      enabled: row.enabled,
      ruleKind: row.ruleKind,
    }));
  }),

  /** Invite by user id, or by @handle or email from the admin page (tg9). */
  invite: adminProcedure
    .input(
      z
        .object({
          userId: z.number().int().positive().optional(),
          who: z.string().trim().min(1).max(255).optional(),
        })
        .refine(v => v.userId !== undefined || !!v.who, "Name a user")
    )
    .mutation(async ({ input }) => {
      const who = input.who?.replace(/^@/, "").toLowerCase();
      const user = await prisma.user.findFirst({
        where:
          input.userId !== undefined
            ? { id: input.userId }
            : who!.includes("@")
              ? { email: who }
              : { handle: who },
        select: { id: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      const now = new Date();
      await prisma.creatorMessagingSettings.upsert({
        where: { userId: user.id },
        create: { userId: user.id, invitedAt: now },
        update: { invitedAt: now },
      });
      return { ok: true };
    }),

  /** Ending the invite also turns Fan messages off. */
  uninvite: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await prisma.creatorMessagingSettings.updateMany({
        where: { userId: input.userId },
        data: { invitedAt: null, enabled: false },
      });
      return { ok: true };
    }),

  /** Row 120 bot health card. */
  botHealth: adminProcedure.query(async () => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const [lastUpdate, pending, failedDay, rateLimitedHour, blockedDay, linked] = await Promise.all(
      [
        prisma.telegramInbox.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.telegramOutbox.count({ where: { status: { in: ["PENDING", "CLAIMED"] } } }),
        prisma.telegramOutbox.count({ where: { status: "FAILED", doneAt: { gte: dayAgo } } }),
        prisma.telegramOutbox.count({
          where: { error: { contains: "429" }, runAfter: { gte: hourAgo } },
        }),
        prisma.telegramAccount.count({ where: { blockedAt: { gte: dayAgo } } }),
        prisma.telegramAccount.count(),
      ]
    );
    return {
      lastUpdateAt: lastUpdate?.createdAt ?? null,
      queueDepth: pending,
      failedLastDay: failedDay,
      rateLimitedLastHour: rateLimitedHour,
      blockedLastDay: blockedDay,
      linkedUsers: linked,
    };
  }),

  /** Connected groups for the Groups tab (board tg9). Names, counts and rules only. */
  listGroups: adminProcedure.query(async () => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [groups, removedToday] = await Promise.all([
      prisma.telegramGroup.findMany({
        where: { connectedAt: { not: null }, disconnectedAt: null },
        orderBy: { connectedAt: "desc" },
        take: 200,
        include: { creator: { select: userSelect } },
      }),
      prisma.telegramGroupMember.count({
        where: { removedAt: { gte: dayAgo }, removedReason: { not: "left" } },
      }),
    ]);
    return {
      removedToday,
      groups: groups.map(group => ({
        id: idToHex(group.id),
        title: group.title,
        creator: group.creator,
        ruleKind: group.ruleKind,
        memberCount: group.memberCount,
        botIsAdmin: group.botIsAdmin,
        lastCheckedAt: group.lastCheckedAt,
      })),
    };
  }),

  /** Queue a check now. Logged with the admin's id. */
  recheckGroup: adminProcedure
    .input(z.object({ id: idSchema }))
    .mutation(async ({ ctx, input }) => {
      const group = await prisma.telegramGroup.findUnique({ where: { id: input.id } });
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found." });
      const queued = await queueGroupCheck(group.id);
      console.info(
        `[telegram:audit] ${JSON.stringify({ action: "group_recheck", adminUserId: ctx.user!.sub, groupId: idToHex(group.id) })}`
      );
      return { queued };
    }),
});
