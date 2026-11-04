import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Prisma, prisma } from "@repo/database";
import { MESSAGE_CAP_SETTING_KEYS, MESSAGE_LIMITS, type MessageCapKey } from "@repo/constants";
import { moderatorProcedure, router } from "../trpc";
import { hexToId, idToHex } from "../../services/analytics/ids";
import { decryptMessageBody } from "../../services/crypto/messageBody";
import { appendAdminLog, readAdminLog } from "../../services/messaging/adminLog";
import {
  clearMessageCapsCache,
  messageCaps,
  messagingEnabled,
} from "../../services/messaging/caps";
import { openStreamCount } from "../../services/realtime/bus";
import { isFeatureOn } from "../../services/featureFlags";

/**
 * admin.messaging (Build Board #2 r4, PR M7, board m6, spec 7.6). Admin, Messaging at
 * /messaging, for admins and moderators: reports with the case view, paused people, caps,
 * flagged terms, a health strip, the kill switch with a reason, and the admin log.
 *
 * Privacy: admins read a conversation only after someone reported it, and every read is
 * logged. Flagged terms show the matched words and the sender, never the message text.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const hexId = z.string().regex(/^[0-9a-f]{32}$/);
const personSelect = { id: true, name: true, handle: true } as const;
type Person = { id: number; name: string; handle: string | null };

const KILL_REASON_KEY = "messaging.enabled.reason";

// Reports filed on the Telegram era thread tables point at threadId and messageId. The M1
// copy reused those ids for conversations and direct messages, so they resolve the same way.
type ReportIds = {
  conversationId: Uint8Array | null;
  threadId: Uint8Array | null;
  directMessageId: Uint8Array | null;
  messageId: Uint8Array | null;
};
const cidOf = (r: ReportIds) => (r.conversationId ?? r.threadId) as Buffer | null;
const midOf = (r: ReportIds) => (r.directMessageId ?? r.messageId) as Buffer | null;
const ON_CONVERSATION = { OR: [{ conversationId: { not: null } }, { threadId: { not: null } }] };

function preview(text: string | null, max = 120) {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

async function pausedSenderIds(userIds: number[], now: Date) {
  if (!userIds.length) return new Set<number>();
  const rows = await prisma.messagingSenderStatus.findMany({
    where: {
      userId: { in: userIds },
      pausedAt: { not: null },
      OR: [{ pausedUntil: null }, { pausedUntil: { gt: now } }],
    },
    select: { userId: true },
  });
  return new Set(rows.map(r => r.userId));
}

async function people(ids: number[]): Promise<Map<number, Person>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: unique } }, select: personSelect });
  return new Map(rows.map(r => [r.id, r]));
}

export const messagingAdminRouter = router({
  /** The strip at the top: volume, live streams on this instance, delivery and the switch. */
  health: moderatorProcedure.query(async () => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - HOUR);
    const dayAgo = new Date(now.getTime() - DAY);
    const [
      messagesLastHour,
      pushDone,
      pushFailed,
      pushSkipped,
      emailsSent,
      openReports,
      enabled,
      reason,
    ] = await Promise.all([
      prisma.directMessage.count({ where: { createdAt: { gte: hourAgo } } }),
      prisma.notificationJob.count({
        where: { channel: "push", status: "DONE", error: null, doneAt: { gte: dayAgo } },
      }),
      prisma.notificationJob.count({
        where: { channel: "push", status: "FAILED", doneAt: { gte: dayAgo } },
      }),
      prisma.notificationJob.count({
        where: { channel: "push", status: "DONE", error: "no_device", doneAt: { gte: dayAgo } },
      }),
      prisma.notificationJob.count({
        where: { channel: "email", status: "DONE", error: null, doneAt: { gte: dayAgo } },
      }),
      prisma.messageReport.count({ where: { ...ON_CONVERSATION, resolvedAt: null } }),
      messagingEnabled(),
      prisma.siteSettings.findUnique({ where: { setting_key: KILL_REASON_KEY } }),
    ]);
    const attempted = pushDone + pushFailed + pushSkipped;
    let off: { reason: string; by: number; at: string } | null = null;
    if (!enabled && reason) {
      try {
        off = JSON.parse(reason.setting_value);
      } catch {
        off = null;
      }
    }
    return {
      messagesLastHour,
      liveStreamsHere: openStreamCount(),
      pushDeliveredRate: attempted ? pushDone / attempted : null,
      emailRemindersToday: emailsSent,
      openReports,
      enabled,
      // The messages feature flag (admin Feature flags) wins over this switch; say which is off
      flagOff: !isFeatureOn("messages"),
      off,
    };
  }),

  /** Reports on conversations, newest first. */
  listReports: moderatorProcedure
    .input(z.object({ status: z.enum(["open", "resolved"]).default("open") }).default({}))
    .query(async ({ input }) => {
      const now = new Date();
      const rows = await prisma.messageReport.findMany({
        where: {
          ...ON_CONVERSATION,
          resolvedAt: input.status === "open" ? null : { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      const conversationIds = rows.map(r => cidOf(r)!);
      const messageIds = rows.map(r => midOf(r)).filter((id): id is Buffer => !!id);
      const [members, messages] = await Promise.all([
        prisma.conversationMember.findMany({
          where: { conversationId: { in: conversationIds as Buffer[] } },
          select: { conversationId: true, userId: true, folder: true, acceptedAt: true },
        }),
        prisma.directMessage.findMany({
          where: { id: { in: messageIds } },
          select: { id: true, bodyEnc: true, unsentAt: true },
        }),
      ]);
      const membersOf = (cid: Uint8Array) =>
        members.filter(m => Buffer.from(m.conversationId).equals(Buffer.from(cid)));
      const messageById = new Map(messages.map(m => [idToHex(m.id), m] as const));
      const reportedIds = rows
        .map(r => membersOf(cidOf(r)!).find(m => m.userId !== r.reporterUserId)?.userId)
        .filter((id): id is number => typeof id === "number");
      const [byId, paused, sentToday] = await Promise.all([
        people([...rows.map(r => r.reporterUserId), ...reportedIds]),
        pausedSenderIds(reportedIds, now),
        Promise.all(
          [...new Set(reportedIds)].map(
            async id =>
              [
                id,
                await prisma.directMessage.count({
                  where: { senderId: id, createdAt: { gte: new Date(now.getTime() - DAY) } },
                }),
              ] as const
          )
        ).then(entries => new Map(entries)),
      ]);
      return rows.map(r => {
        const inConversation = membersOf(cidOf(r)!);
        const reporterMember = inConversation.find(m => m.userId === r.reporterUserId);
        const reportedId = inConversation.find(m => m.userId !== r.reporterUserId)?.userId ?? null;
        const mid = midOf(r);
        const message = mid ? messageById.get(idToHex(mid)) : undefined;
        const snapshot = r.bodySnapshotEnc
          ? decryptMessageBody(r.bodySnapshotEnc)
          : message && !message.unsentAt
            ? decryptMessageBody(message.bodyEnc)
            : null;
        return {
          id: idToHex(r.id),
          reason: r.reason,
          note: r.note,
          createdAt: r.createdAt,
          resolvedAt: r.resolvedAt,
          reporter: byId.get(r.reporterUserId) ?? null,
          reported: reportedId !== null ? (byId.get(reportedId) ?? null) : null,
          // Where the reported person's messages landed for the reporter
          folder:
            reporterMember?.folder === "REQUESTS" && !reporterMember.acceptedAt
              ? "REQUESTS"
              : "PRIMARY",
          sentToday: reportedId !== null ? (sentToday.get(reportedId) ?? 0) : 0,
          snapshot: preview(snapshot),
          unsent: !!message?.unsentAt,
          wholeConversation: !mid,
          status: r.resolvedAt
            ? ("resolved" as const)
            : reportedId !== null && paused.has(reportedId)
              ? ("paused" as const)
              : ("open" as const),
        };
      });
    }),

  /**
   * The case view: the reported conversation around the report, oldest first, with the
   * reported message marked. Refused for a conversation nobody reported. Logged.
   */
  reportCase: moderatorProcedure
    .input(z.object({ reportId: hexId }))
    .query(async ({ ctx, input }) => {
      const report = await prisma.messageReport.findUnique({
        where: { id: hexToId(input.reportId) },
      });
      if (!report || !cidOf(report)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "This report is not available." });
      }
      const cid = cidOf(report)!;
      const [rows, members] = await Promise.all([
        prisma.directMessage.findMany({
          where: { conversationId: cid },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 60,
        }),
        prisma.conversationMember.findMany({
          where: { conversationId: cid },
          select: { userId: true },
        }),
      ]);
      const byId = await people([report.reporterUserId, ...members.map(m => m.userId)]);
      const reportedMid = midOf(report);
      const reportedMessage = reportedMid ? idToHex(reportedMid) : null;
      await appendAdminLog({ by: ctx.user!.sub, action: "case_opened", target: input.reportId });
      return {
        reportId: input.reportId,
        reason: report.reason,
        note: report.note,
        createdAt: report.createdAt,
        resolvedAt: report.resolvedAt,
        reporter: byId.get(report.reporterUserId) ?? null,
        people: members.map(m => byId.get(m.userId)).filter((p): p is Person => !!p),
        messages: rows.reverse().map(m => {
          const id = idToHex(m.id);
          const reported = id === reportedMessage;
          const text = m.unsentAt
            ? reported && report.bodySnapshotEnc
              ? decryptMessageBody(report.bodySnapshotEnc)
              : null
            : decryptMessageBody(m.bodyEnc);
          return {
            id,
            senderId: m.senderId,
            createdAt: m.createdAt,
            body: text,
            unsent: !!m.unsentAt,
            reported,
            flagged: !!m.flaggedTerms,
          };
        }),
      };
    }),

  resolveReport: moderatorProcedure
    .input(z.object({ reportId: hexId }))
    .mutation(async ({ ctx, input }) => {
      await prisma.messageReport.update({
        where: { id: hexToId(input.reportId) },
        data: { resolvedAt: new Date() },
      });
      await appendAdminLog({
        by: ctx.user!.sub,
        action: "report_resolved",
        target: input.reportId,
      });
      return { ok: true };
    }),

  /** Pause someone's sending: 24 hours, or until resumed. */
  pauseSender: moderatorProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        hours: z.union([z.literal(24), z.null()]),
        reason: z.string().trim().min(3).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const data = {
        pausedAt: now,
        pausedUntil: input.hours ? new Date(now.getTime() + input.hours * HOUR) : null,
        pausedReason: `Admin: ${input.reason}`.slice(0, 255),
      };
      await prisma.messagingSenderStatus.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId, ...data },
        update: data,
      });
      await appendAdminLog({
        by: ctx.user!.sub,
        action: "sender_paused",
        target: String(input.userId),
        reason: `${input.hours ? "24 hours" : "until resumed"}: ${input.reason}`,
      });
      return { ok: true };
    }),

  resumeSender: moderatorProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.messagingSenderStatus.updateMany({
        where: { userId: input.userId },
        data: { pausedAt: null, pausedUntil: null, pausedReason: null },
      });
      await appendAdminLog({
        by: ctx.user!.sub,
        action: "sender_resumed",
        target: String(input.userId),
      });
      return { ok: true };
    }),

  /** Reports from enough people pause a person's inbound requests (spec 7.6); resume here. */
  resumeInbound: moderatorProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.messagingSettings.updateMany({
        where: { userId: input.userId },
        data: { pausedAt: null, pausedReason: null },
      });
      await appendAdminLog({
        by: ctx.user!.sub,
        action: "inbound_resumed",
        target: String(input.userId),
      });
      return { ok: true };
    }),

  listPaused: moderatorProcedure.query(async () => {
    const now = new Date();
    const [senders, inbound] = await Promise.all([
      prisma.messagingSenderStatus.findMany({
        where: {
          pausedAt: { not: null },
          OR: [{ pausedUntil: null }, { pausedUntil: { gt: now } }],
        },
        orderBy: { pausedAt: "desc" },
        take: 200,
      }),
      prisma.messagingSettings.findMany({
        where: { pausedAt: { not: null } },
        orderBy: { pausedAt: "desc" },
        take: 200,
      }),
    ]);
    const byId = await people([...senders.map(s => s.userId), ...inbound.map(s => s.userId)]);
    return [
      ...senders.map(s => ({
        kind: "sending" as const,
        person: byId.get(s.userId) ?? { id: s.userId, name: "Deleted account", handle: null },
        pausedAt: s.pausedAt!,
        pausedUntil: s.pausedUntil,
        reason: s.pausedReason,
      })),
      ...inbound.map(s => ({
        kind: "requests" as const,
        person: byId.get(s.userId) ?? { id: s.userId, name: "Deleted account", handle: null },
        pausedAt: s.pausedAt!,
        pausedUntil: null,
        reason: s.pausedReason,
      })),
    ];
  }),

  /** Caps from SiteSettings messaging.caps.*, with the code defaults beside them. */
  caps: moderatorProcedure.query(async () => {
    clearMessageCapsCache();
    const current = await messageCaps();
    const defaults: Record<MessageCapKey, number> = {
      sendsPerConversationPerHour: MESSAGE_LIMITS.sendsPerConversationPerHour,
      sendsPerDay: MESSAGE_LIMITS.sendsPerDay,
      newConversationsPerDay: MESSAGE_LIMITS.newConversationsPerDay,
      newAccountConversationsPerDay: MESSAGE_LIMITS.newAccountConversationsPerDay,
      messagesBeforeAccept: MESSAGE_LIMITS.messagesBeforeAccept,
    };
    return { current, defaults };
  }),

  setCaps: moderatorProcedure
    .input(
      z.object({
        sendsPerConversationPerHour: z.number().int().min(1).max(1000),
        sendsPerDay: z.number().int().min(1).max(10_000),
        newConversationsPerDay: z.number().int().min(1).max(1000),
        newAccountConversationsPerDay: z.number().int().min(0).max(1000),
        messagesBeforeAccept: z.number().int().min(1).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await prisma.$transaction(
        (Object.entries(input) as [MessageCapKey, number][]).map(([name, value]) =>
          prisma.siteSettings.upsert({
            where: { setting_key: MESSAGE_CAP_SETTING_KEYS[name] },
            create: {
              setting_key: MESSAGE_CAP_SETTING_KEYS[name],
              setting_value: String(value),
              value_type: "NUMBER",
            },
            update: { setting_value: String(value) },
          })
        )
      );
      clearMessageCapsCache();
      await appendAdminLog({
        by: ctx.user!.sub,
        action: "caps_saved",
        reason: Object.entries(input)
          .map(([k, v]) => `${k} ${v}`)
          .join(", "),
      });
      return { ok: true };
    }),

  /** Senders whose messages matched the financial promise list. Words and counts only. */
  flagged: moderatorProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }).default({}))
    .query(async ({ input }) => {
      const since = new Date(Date.now() - input.days * DAY);
      const rows = await prisma.directMessage.findMany({
        where: { flaggedTerms: { not: Prisma.DbNull }, createdAt: { gte: since } },
        select: { senderId: true, flaggedTerms: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      const bySender = new Map<number, { count: number; phrases: Set<string>; last: Date }>();
      for (const row of rows) {
        if (row.senderId === null || !row.flaggedTerms) continue;
        const entry = bySender.get(row.senderId) ?? {
          count: 0,
          phrases: new Set(),
          last: row.createdAt,
        };
        entry.count += 1;
        for (const term of row.flaggedTerms as { phrase?: string }[]) {
          if (term?.phrase) entry.phrases.add(term.phrase);
        }
        if (row.createdAt > entry.last) entry.last = row.createdAt;
        bySender.set(row.senderId, entry);
      }
      const [byId, paused] = await Promise.all([
        people([...bySender.keys()]),
        pausedSenderIds([...bySender.keys()], new Date()),
      ]);
      return [...bySender.entries()]
        .map(([senderId, e]) => ({
          person: byId.get(senderId) ?? { id: senderId, name: "Deleted account", handle: null },
          count: e.count,
          phrases: [...e.phrases].slice(0, 8),
          lastAt: e.last,
          paused: paused.has(senderId),
        }))
        .sort((a, b) => b.count - a.count);
    }),

  /** The kill switch. Off needs a reason; both directions are logged. */
  setEnabled: moderatorProcedure
    .input(
      z.discriminatedUnion("enabled", [
        z.object({ enabled: z.literal(false), reason: z.string().trim().min(3).max(200) }),
        z.object({ enabled: z.literal(true) }),
      ])
    )
    .mutation(async ({ ctx, input }) => {
      const by = ctx.user!.sub;
      await prisma.siteSettings.upsert({
        where: { setting_key: "messaging.enabled" },
        create: {
          setting_key: "messaging.enabled",
          setting_value: input.enabled ? "true" : "false",
          value_type: "BOOLEAN",
        },
        update: { setting_value: input.enabled ? "true" : "false" },
      });
      if (!input.enabled) {
        const value = JSON.stringify({ reason: input.reason, by, at: new Date().toISOString() });
        await prisma.siteSettings.upsert({
          where: { setting_key: KILL_REASON_KEY },
          create: { setting_key: KILL_REASON_KEY, setting_value: value, value_type: "JSON" },
          update: { setting_value: value },
        });
      }
      await appendAdminLog({
        by,
        action: input.enabled ? "kill_switch_on" : "kill_switch_off",
        reason: input.enabled ? undefined : input.reason,
      });
      return { enabled: await messagingEnabled() };
    }),

  /** The latest 50 admin actions with who did them. */
  log: moderatorProcedure.query(async () => {
    const entries = (await readAdminLog()).slice(0, 50);
    const byId = await people(entries.map(e => e.by));
    return entries.map(e => ({ ...e, actor: byId.get(e.by) ?? null }));
  }),
});
