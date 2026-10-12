import { GrammyError, InlineKeyboard } from "grammy";
import { prisma, type TelegramOutbox } from "@repo/database";
import { TELEGRAM_BOT_BUTTONS, TELEGRAM_BOT_STRINGS } from "@repo/constants";
import { env } from "../../env";
import { hexToId, idToHex } from "../analytics/ids";
import { findByUserId, isReachable, markBotBlocked } from "../telegram/accounts";
import { getTelegramBot } from "../telegram/client";
import { registerOutboxHandler } from "../telegram/loop";
import type { DmPayload } from "./threads";
import { fanViews, personLabel } from "./views";

/**
 * Messaging on Telegram (Build Board #2), phase 1, spec 3.5. Outbox kind "dm": copy one
 * stored message to the other side's Telegram chat with the bot.
 *
 * - To the creator: only when the creator keeps Reply from Telegram on, the thread is
 *   not muted and the bot can reach them. The copy reads "@fan (Follower): text"; a
 *   reply to it in Telegram answers the fan (the forward id resolves the thread).
 * - To the fan: when the bot can reach them. Otherwise the message is marked
 *   not_reachable and the web inbox shows it (acceptance 8).
 *
 * The handler is idempotent: a message that already has a forward id is not sent
 * again, and a thread that was blocked since the send is not delivered (acceptance 9).
 */

function threadUrl(threadId: Uint8Array) {
  return `${env.APP_URL.replace(/\/+$/, "")}/inbox?t=${idToHex(threadId)}`;
}

async function fanLabelForCreator(creatorUserId: number, fanUserId: number) {
  const view = (await fanViews(creatorUserId, [fanUserId])).get(fanUserId);
  if (!view) return "";
  const parts = [personLabel(view)];
  if (view.telegramUsername) parts.push(`(@${view.telegramUsername} on Telegram)`);
  if (view.relationLabel) parts.push(`(${view.relationLabel})`);
  return parts.join(" ");
}

export async function deliverDmJob(job: TelegramOutbox): Promise<void> {
  const payload = job.payload as Partial<DmPayload> | null;
  if (!payload?.messageId || (payload.to !== "creator" && payload.to !== "fan")) return;
  const message = await prisma.message.findUnique({
    where: { id: hexToId(payload.messageId) },
    include: {
      thread: {
        select: {
          id: true,
          status: true,
          creatorUserId: true,
          fanUserId: true,
          mutedUntil: true,
          creator: { select: { name: true } },
        },
      },
    },
  });
  if (!message || message.tgForwardMessageId !== null) return;
  const { thread } = message;

  if (thread.status !== "OPEN") {
    await prisma.message.update({
      where: { id: message.id },
      data: { failedReason: "thread_closed" },
    });
    return;
  }

  const recipientId = payload.to === "creator" ? thread.creatorUserId : thread.fanUserId;
  if (payload.to === "creator") {
    const settings = await prisma.creatorMessagingSettings.findUnique({
      where: { userId: thread.creatorUserId },
      select: { replyFromTelegram: true },
    });
    // The creator reads on the web only, or muted this thread: the inbox has it
    if (!settings?.replyFromTelegram) return;
    if (thread.mutedUntil && thread.mutedUntil > new Date()) return;
  }

  const account = await findByUserId(recipientId);
  if (!isReachable(account)) {
    if (payload.to === "fan") {
      await prisma.message.update({
        where: { id: message.id },
        data: { failedReason: "not_reachable" },
      });
    }
    return;
  }

  const bot = getTelegramBot();
  if (!bot) throw new Error("no_bot");

  const text =
    payload.to === "creator"
      ? TELEGRAM_BOT_STRINGS.fanWrote(
          await fanLabelForCreator(thread.creatorUserId, thread.fanUserId),
          message.body
        )
      : TELEGRAM_BOT_STRINGS.creatorReplied(thread.creator.name, message.body);

  try {
    const sent = await bot.api.sendMessage(Number(account!.telegramUserId), text, {
      link_preview_options: { is_disabled: true },
      reply_markup: new InlineKeyboard().url(TELEGRAM_BOT_BUTTONS.openThread, threadUrl(thread.id)),
    });
    await prisma.message.update({
      where: { id: message.id },
      data: {
        tgForwardMessageId: BigInt(sent.message_id),
        deliveredAt: new Date(),
        failedReason: null,
      },
    });
  } catch (error) {
    if (error instanceof GrammyError && error.error_code === 403) {
      await markBotBlocked(recipientId);
      await prisma.message.update({
        where: { id: message.id },
        data: { failedReason: "not_reachable" },
      });
      return;
    }
    throw error;
  }
}

let registered = false;
/** Register the phase 1 outbox handler. Called once from bootstrap.ts. */
export function registerMessagingOutboxHandlers() {
  if (registered) return;
  registered = true;
  registerOutboxHandler("dm", deliverDmJob);
}
