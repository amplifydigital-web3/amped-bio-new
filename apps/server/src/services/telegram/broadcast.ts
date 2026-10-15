import { GrammyError, InlineKeyboard } from "grammy";
import { prisma, type TelegramOutbox } from "@repo/database";
import {
  BROADCAST_FOOTER,
  TELEGRAM_BOT_BUTTONS,
  TELEGRAM_BOT_STRINGS,
  TELEGRAM_LIMITS,
  broadcastPlainText,
  findBannedTerms,
  parseBroadcastBody,
} from "@repo/constants";
import { env } from "../../env";
import { GLOBAL_PREFERENCE, recordLinkEvent } from "./accounts";
import { getTelegramBot, isTelegramConfigured } from "./client";
import { OUTBOX_PRIORITY, registerOutboxHandler } from "./loop";
import { uuidv7 } from "../../utils/uuid-v7";

/**
 * Messaging on Telegram (Build Board #2), spec 3.5 broadcast channel adapter.
 *
 * After Broadcast (#1) fans a broadcast out to the Amped inbox, a broadcast the
 * creator ticked Telegram on writes one telegram_outbox row per delivery whose
 * recipient is eligible (acceptance 2 and 3):
 * - the user linked Telegram, the bot may write to them (botAccess) and they
 *   have not blocked it,
 * - their global preference row has telegramEnabled true,
 * - their row for this creator is not false and neither row is muted.
 *
 * The sender loop drains the rows at Telegram's pace, DMs first. Each send
 * re-checks eligibility, so a fan who turns updates off or blocks the bot
 * between fan-out and send gets nothing.
 *
 * A broadcast whose words matched the word list stays in the Amped inbox only.
 * The word list warns the creator and never holds the inbox copy (Rob,
 * 2026-10-04); Telegram is an outside channel, so a flagged broadcast does not
 * go there. The send path runs the check again on the converted text.
 */

const CHUNK = 500;
/** Telegram's message limit is 4,096 characters after entities are parsed. */
const MESSAGE_BUDGET = 3800;

type PreferenceRow = {
  userId: number;
  creatorUserId: number;
  telegramEnabled: boolean | null;
  mutedUntil: Date | null;
};

function muted(row: PreferenceRow | undefined, now: Date) {
  return !!row?.mutedUntil && row.mutedUntil > now;
}

/** Of `userIds`, who gets this creator's broadcasts on Telegram right now. Returns userId to chat id. */
export async function telegramEligibleRecipients(
  creatorUserId: number,
  userIds: number[],
  now = new Date()
): Promise<Map<number, bigint>> {
  const result = new Map<number, bigint>();
  if (userIds.length === 0) return result;
  const [accounts, prefs] = await Promise.all([
    prisma.telegramAccount.findMany({
      where: { userId: { in: userIds }, botAccess: true, blockedAt: null },
      select: { userId: true, telegramUserId: true },
    }),
    prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, creatorUserId: { in: [GLOBAL_PREFERENCE, creatorUserId] } },
      select: { userId: true, creatorUserId: true, telegramEnabled: true, mutedUntil: true },
    }),
  ]);
  const global = new Map<number, PreferenceRow>();
  const perCreator = new Map<number, PreferenceRow>();
  for (const row of prefs) {
    (row.creatorUserId === GLOBAL_PREFERENCE ? global : perCreator).set(row.userId, row);
  }
  for (const account of accounts) {
    const g = global.get(account.userId);
    const c = perCreator.get(account.userId);
    if (g?.telegramEnabled !== true) continue;
    if (c?.telegramEnabled === false) continue;
    if (muted(g, now) || muted(c, now)) continue;
    result.set(account.userId, account.telegramUserId);
  }
  return result;
}

/** How many members of a pool would get a broadcast on Telegram now. For the composer count line. */
export async function telegramReach(creatorUserId: number, memberIds: number[]) {
  let total = 0;
  for (let i = 0; i < memberIds.length; i += CHUNK) {
    total += (await telegramEligibleRecipients(creatorUserId, memberIds.slice(i, i + CHUNK))).size;
  }
  return total;
}

/**
 * Write the Telegram rows for a broadcast that finished its inbox fan-out.
 * Idempotent: only deliveries still NOT_ELIGIBLE are considered, and each
 * chunk flips them to PENDING in the same transaction that writes the rows.
 */
export async function enqueueTelegramBroadcast(broadcastId: number): Promise<number> {
  if (!isTelegramConfigured()) return 0;
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { id: true, creatorUserId: true, sendTelegram: true, status: true, flaggedTerms: true },
  });
  if (!broadcast || !broadcast.sendTelegram || broadcast.status !== "SENT") return 0;
  const flagged = Array.isArray(broadcast.flaggedTerms) && broadcast.flaggedTerms.length > 0;
  if (flagged) return 0;

  let queued = 0;
  let cursor = 0;
  for (;;) {
    const deliveries = await prisma.broadcastDelivery.findMany({
      where: { broadcastId, telegramStatus: "NOT_ELIGIBLE", id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: CHUNK,
      select: { id: true, userId: true },
    });
    if (deliveries.length === 0) break;
    cursor = deliveries[deliveries.length - 1]!.id;

    const eligible = await telegramEligibleRecipients(
      broadcast.creatorUserId,
      deliveries.map(d => d.userId)
    );
    const picked = deliveries.filter(d => eligible.has(d.userId));
    if (picked.length === 0) continue;
    await prisma.$transaction([
      prisma.broadcastDelivery.updateMany({
        where: { id: { in: picked.map(d => d.id) }, telegramStatus: "NOT_ELIGIBLE" },
        data: { telegramStatus: "PENDING" },
      }),
      prisma.telegramOutbox.createMany({
        data: picked.map(d => ({
          id: uuidv7(),
          kind: "broadcast",
          priority: OUTBOX_PRIORITY.broadcast,
          chatId: eligible.get(d.userId)!,
          deliveryId: d.id,
          payload: { broadcastId },
        })),
      }),
    ]);
    queued += picked.length;
  }
  if (queued > 0) console.log(`[telegram] broadcast ${broadcastId} queued for ${queued} chats`);
  return queued;
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The Markdown subset of a broadcast body as Telegram HTML. User text is always escaped. */
export function broadcastBodyToTelegramHtml(body: string): string {
  return parseBroadcastBody(body)
    .map(paragraph =>
      paragraph
        .map(line =>
          line
            .map(token => {
              const text = escapeHtml(token.text);
              if (token.type === "bold") return `<b>${text}</b>`;
              if (token.type === "italic") return `<i>${text}</i>`;
              if (token.type === "link") return `<a href="${escapeHtml(token.href)}">${text}</a>`;
              return text;
            })
            .join("")
        )
        .join("\n")
    )
    .join("\n\n");
}

/** The whole Telegram message: creator and title, body, the fixed footers. */
export function renderTelegramBroadcast(input: {
  creatorName: string;
  title: string;
  body: string;
}): string {
  const head = `<b>${escapeHtml(input.creatorName)}: ${escapeHtml(input.title)}</b>`;
  const foot = `<i>${escapeHtml(BROADCAST_FOOTER(input.creatorName))}</i>\n${escapeHtml(TELEGRAM_BOT_STRINGS.broadcastFooter)}`;
  let body = broadcastBodyToTelegramHtml(input.body);
  if (head.length + body.length + foot.length + 4 > MESSAGE_BUDGET) {
    // Too long for one Telegram message: send the start as plain text, the inbox has the rest
    const room = MESSAGE_BUDGET - head.length - foot.length - 8;
    body = `${escapeHtml(broadcastPlainText(input.body).slice(0, Math.max(room, 200)))}...`;
  }
  return `${head}\n\n${body}\n\n${foot}`;
}

async function setDeliveryStatus(
  deliveryId: number,
  data: { telegramStatus: "NOT_ELIGIBLE" | "SENT" | "FAILED" | "BLOCKED"; tgMessageId?: bigint }
) {
  await prisma.broadcastDelivery.update({ where: { id: deliveryId }, data });
}

/** Outbox handler for kind "broadcast": send one delivery. */
export async function sendTelegramBroadcastJob(job: TelegramOutbox): Promise<void> {
  if (job.deliveryId === null) return;
  const delivery = await prisma.broadcastDelivery.findUnique({
    where: { id: job.deliveryId },
    select: {
      id: true,
      userId: true,
      telegramStatus: true,
      broadcast: {
        select: {
          title: true,
          body: true,
          status: true,
          creatorUserId: true,
          creator: { select: { name: true } },
        },
      },
    },
  });
  if (!delivery || delivery.telegramStatus !== "PENDING") return;
  const { broadcast } = delivery;
  if (broadcast.status !== "SENT") {
    await setDeliveryStatus(delivery.id, { telegramStatus: "NOT_ELIGIBLE" });
    return;
  }

  // Re-check: the fan may have turned updates off or blocked the bot since fan-out
  const eligible = await telegramEligibleRecipients(broadcast.creatorUserId, [delivery.userId]);
  const chatId = eligible.get(delivery.userId);
  if (chatId === undefined) {
    await setDeliveryStatus(delivery.id, { telegramStatus: "NOT_ELIGIBLE" });
    return;
  }

  const text = renderTelegramBroadcast({
    creatorName: broadcast.creator.name,
    title: broadcast.title,
    body: broadcast.body,
  });
  if (findBannedTerms(`${broadcast.title}\n${broadcast.body}`).length > 0) {
    await setDeliveryStatus(delivery.id, { telegramStatus: "NOT_ELIGIBLE" });
    return;
  }

  const bot = getTelegramBot();
  if (!bot) throw new Error("no_bot");
  try {
    const sent = await bot.api.sendMessage(Number(chatId), text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: new InlineKeyboard().url(
        TELEGRAM_BOT_BUTTONS.openOnAmped,
        `${env.APP_URL.replace(/\/+$/, "")}/inbox`
      ),
    });
    await setDeliveryStatus(delivery.id, {
      telegramStatus: "SENT",
      tgMessageId: BigInt(sent.message_id),
    });
  } catch (error) {
    if (error instanceof GrammyError && error.error_code === 403) {
      // The user blocked the bot: stop writing to them until they press Start again
      const account = await prisma.telegramAccount.findUnique({
        where: { userId: delivery.userId },
        select: { id: true, telegramUserId: true, blockedAt: true },
      });
      if (account && !account.blockedAt) {
        await prisma.telegramAccount.update({
          where: { id: account.id },
          data: { blockedAt: new Date() },
        });
        await recordLinkEvent(
          delivery.userId,
          account.telegramUserId,
          "bot_blocked",
          "my_chat_member"
        );
      }
      await setDeliveryStatus(delivery.id, { telegramStatus: "BLOCKED" });
      return;
    }
    if (job.attempts >= TELEGRAM_LIMITS.jobMaxAttempts) {
      await setDeliveryStatus(delivery.id, { telegramStatus: "FAILED" });
    }
    throw error;
  }
}

/** Outbox handler for kind "notice": one plain message to one chat, for example the unlink notice. */
export async function sendTelegramNoticeJob(job: TelegramOutbox): Promise<void> {
  const payload = job.payload as { text?: unknown } | null;
  if (job.chatId === null || typeof payload?.text !== "string") return;
  const bot = getTelegramBot();
  if (!bot) throw new Error("no_bot");
  try {
    await bot.api.sendMessage(Number(job.chatId), payload.text);
  } catch (error) {
    // A blocked bot cannot deliver a notice; nothing to retry
    if (error instanceof GrammyError && error.error_code === 403) return;
    throw error;
  }
}

let registered = false;
/** Register the phase 0 outbox handlers. Called once from bootstrap.ts. */
export function registerTelegramOutboxHandlers() {
  if (registered) return;
  registered = true;
  registerOutboxHandler("broadcast", sendTelegramBroadcastJob);
  registerOutboxHandler("notice", sendTelegramNoticeJob);
}
