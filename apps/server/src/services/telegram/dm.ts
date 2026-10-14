import { InlineKeyboard, type Context } from "grammy";
import { prisma, type TelegramAccount } from "@repo/database";
import { TELEGRAM_BOT_BUTTONS, TELEGRAM_BOT_STRINGS, TELEGRAM_LIMITS } from "@repo/constants";
import { env } from "../../env";
import { cache } from "../../utils/cache";
import {
  MessagingRefusal,
  canMessage,
  getCreatorSettings,
  type MessagingRefusalReason,
} from "../messaging/access";
import { MessagingInputError, sendCreatorReply, sendFanMessage } from "../messaging/threads";
import { findByTelegramId } from "./accounts";
import { emitTelegramEvent } from "./events";

/**
 * Messaging on Telegram (Build Board #2), phase 1, spec 3.5. The bot side of fan to
 * creator messages:
 *
 * - `/start dm_{handle}` picks the creator, checks the door and says so.
 * - A text message is routed by reply context first (a creator answering a forwarded
 *   fan message, or a fan answering a creator's reply), then by the active creator
 *   in the session, then by a picker. A text sent before picking is kept for 10
 *   minutes and sent once the fan picks.
 * - A creator who writes without replying gets the reply hint.
 * - Anything but text gets "Text only for now" and is not stored.
 */

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const PENDING_TTL_SECONDS = 10 * 60;
const PICKER_SIZE = 8;

type Session = { activeCreatorId: number };
type Pending = { text: string; tgMessageId: number };

const sessionKey = (telegramUserId: number) => `tg:session:${telegramUserId}`;
const pendingKey = (telegramUserId: number) => `tg:pending:${telegramUserId}`;

export async function setActiveCreator(telegramUserId: number, creatorUserId: number) {
  await cache.set<Session>(
    sessionKey(telegramUserId),
    { activeCreatorId: creatorUserId },
    SESSION_TTL_SECONDS
  );
}

async function activeCreator(telegramUserId: number): Promise<number | null> {
  const session = await cache.get<Session>(sessionKey(telegramUserId));
  return session?.activeCreatorId ?? null;
}

function pageUrl(handle: string) {
  return `${env.LANDINGPAGE_URL.replace(/\/+$/, "")}/${encodeURIComponent(handle)}`;
}

function linkUrl() {
  return `${env.APP_URL.replace(/\/+$/, "")}/account?open=connected-apps&link=telegram`;
}

async function replyNotLinked(ctx: Context) {
  await ctx.reply(TELEGRAM_BOT_STRINGS.startNotLinked, {
    reply_markup: new InlineKeyboard().url(TELEGRAM_BOT_BUTTONS.linkTelegram, linkUrl()),
  });
}

/** Bot copy for a refusal. Rule refusals carry a button to the creator's page. */
export function refusalText(reason: MessagingRefusalReason, creatorName: string): string {
  const s = TELEGRAM_BOT_STRINGS;
  switch (reason) {
    case "not_follower":
      return s.dmRefused.FOLLOWER(creatorName);
    case "not_member":
      return s.dmRefused.PAID_MEMBER(creatorName);
    case "not_pool_fan":
      return s.dmRefused.POOL_MEMBER(creatorName);
    case "stake_below":
      return s.dmRefused.STAKE_MIN(creatorName);
    case "cap_reached":
      return s.dmCapReached(creatorName);
    case "sender_cap":
      return s.fanCapReached;
    case "sender_paused":
      return s.senderPaused;
    case "disabled":
    case "blocked":
      return s.dmPausedOrBlocked(creatorName);
  }
}

const RULE_REASONS = new Set<MessagingRefusalReason>([
  "not_follower",
  "not_member",
  "not_pool_fan",
  "stake_below",
]);

async function replyRefusal(
  ctx: Context,
  reason: MessagingRefusalReason,
  creator: { name: string; handle: string | null }
) {
  const keyboard =
    RULE_REASONS.has(reason) && creator.handle
      ? new InlineKeyboard().url(
          TELEGRAM_BOT_BUTTONS.openCreator(creator.name),
          pageUrl(creator.handle)
        )
      : undefined;
  await ctx.reply(refusalText(reason, creator.name), keyboard ? { reply_markup: keyboard } : {});
}

async function creatorById(id: number) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, name: true, handle: true } });
}

/** Published creator by handle, matched the way getHandle matches. */
async function creatorByHandle(handle: string) {
  const clean = handle.replace(/^@/, "").trim();
  if (!clean || clean.length > 64) return null;
  return prisma.user.findFirst({
    where: {
      OR: [{ handle: clean }, { handle: clean.toLowerCase() }],
      page_status: "PUBLISHED",
      block: "no",
    },
    select: { id: true, name: true, handle: true },
  });
}

async function react(ctx: Context) {
  try {
    await ctx.react("👍");
  } catch {
    // A reaction is a courtesy; the message is stored either way
  }
}

/** A fan sends `text` to a creator from Telegram. Answers the fan in every outcome. */
async function fanSend(
  ctx: Context,
  account: TelegramAccount,
  creatorUserId: number,
  text: string,
  tgMessageId: number
) {
  const creator = await creatorById(creatorUserId);
  if (!creator) {
    await ctx.reply(TELEGRAM_BOT_STRINGS.dmNotFound);
    return;
  }
  try {
    await sendFanMessage({
      fanUserId: account.userId,
      creatorUserId,
      body: text,
      channel: "TELEGRAM",
      tgMessageId: BigInt(tgMessageId),
    });
    await setActiveCreator(Number(account.telegramUserId), creatorUserId);
    await react(ctx);
  } catch (error) {
    if (error instanceof MessagingRefusal) {
      await replyRefusal(ctx, error.reason, creator);
      return;
    }
    if (error instanceof MessagingInputError && error.code === "too_long") {
      await ctx.reply(TELEGRAM_BOT_STRINGS.messageTooLong);
      return;
    }
    throw error;
  }
}

/** Open threads and followed creators, newest first, for the picker and /creators. */
async function pickerCreators(userId: number) {
  const [threads, follows] = await Promise.all([
    prisma.messageThread.findMany({
      where: { fanUserId: userId, status: "OPEN", lastMessageAt: { not: null } },
      orderBy: { lastMessageAt: "desc" },
      take: PICKER_SIZE,
      select: { creator: { select: { id: true, name: true } } },
    }),
    prisma.follow.findMany({
      where: { follower_id: userId, creator: { page_status: "PUBLISHED", block: "no" } },
      orderBy: { created_at: "desc" },
      take: PICKER_SIZE,
      select: { creator: { select: { id: true, name: true } } },
    }),
  ]);
  const seen = new Set<number>();
  const out: Array<{ id: number; name: string }> = [];
  for (const row of [...threads, ...follows]) {
    if (seen.has(row.creator.id) || out.length >= PICKER_SIZE) continue;
    seen.add(row.creator.id);
    out.push(row.creator);
  }
  return out;
}

function pickerKeyboard(creators: Array<{ id: number; name: string }>) {
  const keyboard = new InlineKeyboard();
  for (const creator of creators) {
    keyboard.text(TELEGRAM_BOT_BUTTONS.messageCreator(creator.name), `pick:${creator.id}`).row();
  }
  return keyboard;
}

/**
 * `/start dm_{handle}` from the Message me button. Called by handleStart after it has
 * granted bot access. Returns false when the payload names the caller's own page, so
 * the caller answers as a plain /start.
 */
export async function handleDmStart(ctx: Context, account: TelegramAccount, handle: string) {
  const creator = await creatorByHandle(handle);
  if (!creator) {
    await ctx.reply(TELEGRAM_BOT_STRINGS.dmNotFound);
    return true;
  }
  if (creator.id === account.userId) return false;
  await setActiveCreator(Number(account.telegramUserId), creator.id);
  const verdict = await canMessage(account.userId, creator.id);
  if (!verdict.allowed) {
    emitTelegramEvent("dm_refused", { reason: verdict.reason });
    await replyRefusal(ctx, verdict.reason, creator);
    return true;
  }
  await ctx.reply(TELEGRAM_BOT_STRINGS.dmReady(creator.name));
  return true;
}

/** Any text in the private chat that is not a command. */
export async function handlePrivateText(ctx: Context) {
  const message = ctx.message;
  const from = ctx.from;
  if (!message || !from || typeof message.text !== "string") return;
  if (message.text.startsWith("/")) return;
  const account = await findByTelegramId(from.id);
  if (!account) {
    await replyNotLinked(ctx);
    return;
  }
  if (message.text.length > TELEGRAM_LIMITS.messageBodyMax) {
    await ctx.reply(TELEGRAM_BOT_STRINGS.messageTooLong);
    return;
  }

  const replyTo = message.reply_to_message?.message_id;
  if (replyTo !== undefined) {
    const forwardId = BigInt(replyTo);
    // A creator answering the copy of a fan's message
    const fanMessage = await prisma.message.findFirst({
      where: {
        tgForwardMessageId: forwardId,
        sender: "FAN",
        thread: { creatorUserId: account.userId },
      },
      select: { threadId: true },
    });
    if (fanMessage) {
      try {
        await sendCreatorReply({
          creatorUserId: account.userId,
          threadId: fanMessage.threadId,
          body: message.text,
          channel: "TELEGRAM",
          tgMessageId: BigInt(message.message_id),
        });
        await react(ctx);
      } catch (error) {
        if (error instanceof MessagingInputError && error.code === "thread_closed") {
          await ctx.reply(TELEGRAM_BOT_STRINGS.replyThreadClosed);
          return;
        }
        throw error;
      }
      return;
    }
    // A fan answering the copy of a creator's reply
    const creatorMessage = await prisma.message.findFirst({
      where: {
        tgForwardMessageId: forwardId,
        sender: "CREATOR",
        thread: { fanUserId: account.userId },
      },
      select: { thread: { select: { creatorUserId: true } } },
    });
    if (creatorMessage) {
      await fanSend(
        ctx,
        account,
        creatorMessage.thread.creatorUserId,
        message.text,
        message.message_id
      );
      return;
    }
  }

  const active = await activeCreator(from.id);
  if (active !== null) {
    await fanSend(ctx, account, active, message.text, message.message_id);
    return;
  }

  // A creator writing without replying to a fan's message
  const settings = await getCreatorSettings(account.userId);
  if (settings?.enabled) {
    const hasThreads = await prisma.messageThread.count({
      where: { creatorUserId: account.userId },
    });
    if (hasThreads > 0) {
      await ctx.reply(TELEGRAM_BOT_STRINGS.creatorNotAReply);
      return;
    }
  }

  const creators = await pickerCreators(account.userId);
  if (creators.length === 0) {
    await ctx.reply(TELEGRAM_BOT_STRINGS.creatorsNone);
    return;
  }
  await cache.set<Pending>(
    pendingKey(from.id),
    { text: message.text, tgMessageId: message.message_id },
    PENDING_TTL_SECONDS
  );
  await ctx.reply(TELEGRAM_BOT_STRINGS.pickCreator, { reply_markup: pickerKeyboard(creators) });
}

/** `pick:{creatorUserId}` from the picker or /creators. */
export async function handlePickCallback(ctx: Context) {
  const data = ctx.callbackQuery?.data ?? "";
  const match = /^pick:(\d{1,10})$/.exec(data);
  await ctx.answerCallbackQuery().catch(() => undefined);
  const from = ctx.from;
  if (!match || !from) return;
  const account = await findByTelegramId(from.id);
  if (!account) {
    await replyNotLinked(ctx);
    return;
  }
  const creatorUserId = Number(match[1]);
  const creator = await creatorById(creatorUserId);
  if (!creator || creator.id === account.userId) {
    await ctx.reply(TELEGRAM_BOT_STRINGS.dmNotFound);
    return;
  }
  await setActiveCreator(from.id, creatorUserId);
  const pending = await cache.get<Pending>(pendingKey(from.id));
  if (pending) {
    await cache.delete(pendingKey(from.id));
    await fanSend(ctx, account, creatorUserId, pending.text, pending.tgMessageId);
    return;
  }
  await ctx.reply(TELEGRAM_BOT_STRINGS.dmReady(creator.name));
}

/** `/creators`: who the fan can write to. */
export async function handleCreators(ctx: Context) {
  const from = ctx.from;
  if (!from) return;
  const account = await findByTelegramId(from.id);
  if (!account) {
    await replyNotLinked(ctx);
    return;
  }
  const creators = await pickerCreators(account.userId);
  if (creators.length === 0) {
    await ctx.reply(TELEGRAM_BOT_STRINGS.creatorsNone);
    return;
  }
  await ctx.reply(TELEGRAM_BOT_STRINGS.creatorsList, { reply_markup: pickerKeyboard(creators) });
}

/** Photos, files, voice, stickers: not carried in v1 (spec 3.5). */
export async function handleNonText(ctx: Context) {
  await ctx.reply(TELEGRAM_BOT_STRINGS.textOnly);
}
