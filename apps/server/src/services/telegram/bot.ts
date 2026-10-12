import { InlineKeyboard, type Bot, type Context } from "grammy";
import { prisma } from "@repo/database";
import { TELEGRAM_BOT_BUTTONS, TELEGRAM_BOT_STRINGS } from "@repo/constants";
import { env } from "../../env";
import { findByTelegramId, recordLinkEvent, setGlobalTelegramDelivery } from "./accounts";

/**
 * Messaging on Telegram (Build Board #2), spec 3.5, phase 0. The bot's commands
 * and the private chat membership handler. Every string comes from
 * packages/constants/src/telegram.ts (the counsel reviewed bot copy).
 *
 * Phase 0 handles /start, /stop, /help, /privacy and my_chat_member in private
 * chats. Start payloads (dm_, join_, ref_), fan messages and groups arrive in
 * later PRs; until then a payload is answered as a plain /start. The bot never
 * answers in a group.
 */

const MAX_CREATOR_BUTTONS = 5;

function appUrl(path: string) {
  return `${env.APP_URL.replace(/\/+$/, "")}${path}`;
}

function pageUrl(handle: string) {
  return `${env.LANDINGPAGE_URL.replace(/\/+$/, "")}/${encodeURIComponent(handle)}`;
}

export const BOT_LINKS = {
  link: () => appUrl("/account?open=connected-apps&link=telegram"),
  account: () => appUrl("/account?open=connected-apps"),
  home: () => appUrl("/"),
  privacy: () => `${env.LANDINGPAGE_URL.replace(/\/+$/, "")}/privacy`,
};

function displayHandle(user: { handle: string | null; name: string }) {
  return user.handle ? `@${user.handle}` : user.name;
}

/** Up to five published creators the user follows, newest follow first. */
async function followedCreators(userId: number) {
  const rows = await prisma.follow.findMany({
    where: {
      follower_id: userId,
      creator: { page_status: "PUBLISHED", block: "no", handle: { not: null } },
    },
    orderBy: { created_at: "desc" },
    take: MAX_CREATOR_BUTTONS,
    select: { creator: { select: { handle: true, name: true } } },
  });
  return rows
    .map(row => row.creator)
    .filter((c): c is { handle: string; name: string } => !!c.handle);
}

function notLinkedKeyboard() {
  return new InlineKeyboard()
    .url(TELEGRAM_BOT_BUTTONS.linkTelegram, BOT_LINKS.link())
    .row()
    .url(TELEGRAM_BOT_BUTTONS.openAmped, BOT_LINKS.home());
}

async function replyNotLinked(ctx: Context) {
  await ctx.reply(TELEGRAM_BOT_STRINGS.startNotLinked, { reply_markup: notLinkedKeyboard() });
}

export async function handleStart(ctx: Context) {
  const from = ctx.from;
  if (!from) return;
  const account = await findByTelegramId(from.id);
  if (!account) {
    await replyNotLinked(ctx);
    return;
  }

  // Pressing Start grants the bot access and clears a block (spec 3.5)
  const firstStart = !account.botAccess;
  if (!account.botAccess || account.blockedAt) {
    await prisma.telegramAccount.update({
      where: { id: account.id },
      data: { botAccess: true, blockedAt: null, lastSeenAt: new Date() },
    });
    await recordLinkEvent(account.userId, account.telegramUserId, "bot_started", "start_command");
  }

  const [user, creators] = await Promise.all([
    prisma.user.findUnique({
      where: { id: account.userId },
      select: { handle: true, name: true },
    }),
    followedCreators(account.userId),
  ]);
  const handle = user ? displayHandle(user) : "there";
  const keyboard = new InlineKeyboard();
  for (const creator of creators) {
    keyboard.url(TELEGRAM_BOT_BUTTONS.openCreator(creator.name), pageUrl(creator.handle)).row();
  }
  keyboard.url(TELEGRAM_BOT_BUTTONS.openAmped, BOT_LINKS.home());

  const text = firstStart
    ? TELEGRAM_BOT_STRINGS.startLinkedFirst(handle)
    : TELEGRAM_BOT_STRINGS.startLinkedReturning(handle);
  await ctx.reply(text, { reply_markup: keyboard });
}

export async function handleStop(ctx: Context) {
  const from = ctx.from;
  if (!from) return;
  const account = await findByTelegramId(from.id);
  if (!account) {
    await replyNotLinked(ctx);
    return;
  }
  await setGlobalTelegramDelivery(account.userId, account.telegramUserId, false, "stop_command");
  await ctx.reply(TELEGRAM_BOT_STRINGS.stop);
}

export async function handleHelp(ctx: Context) {
  await ctx.reply(TELEGRAM_BOT_STRINGS.help, {
    reply_markup: new InlineKeyboard().url(TELEGRAM_BOT_BUTTONS.openAmped, BOT_LINKS.home()),
  });
}

export async function handlePrivacy(ctx: Context) {
  await ctx.reply(TELEGRAM_BOT_STRINGS.privacy, {
    reply_markup: new InlineKeyboard()
      .url(TELEGRAM_BOT_BUTTONS.privacyNotice, BOT_LINKS.privacy())
      .row()
      .url(TELEGRAM_BOT_BUTTONS.openAccount, BOT_LINKS.account()),
  });
}

/** The user blocked or unblocked the bot in their private chat (spec 3.5). */
export async function handlePrivateChatMember(ctx: Context) {
  const update = ctx.myChatMember;
  if (!update || update.chat.type !== "private") return;
  const account = await findByTelegramId(update.from.id);
  if (!account) return;
  const status = update.new_chat_member.status;
  if (status === "kicked") {
    await prisma.telegramAccount.update({
      where: { id: account.id },
      data: { blockedAt: new Date() },
    });
    await recordLinkEvent(account.userId, account.telegramUserId, "bot_blocked", "my_chat_member");
  } else if (status === "member" && account.blockedAt) {
    await prisma.telegramAccount.update({
      where: { id: account.id },
      data: { blockedAt: null, botAccess: true },
    });
    await recordLinkEvent(
      account.userId,
      account.telegramUserId,
      "bot_unblocked",
      "my_chat_member"
    );
  }
}

/** Register the phase 0 handlers on a bot. Called once when the client is created. */
export function installBotHandlers(bot: Bot) {
  const priv = bot.chatType("private");
  priv.command("start", handleStart);
  priv.command("stop", handleStop);
  priv.command("help", handleHelp);
  priv.command("privacy", handlePrivacy);
  // A handler error propagates out of bot.handleUpdate, so the sender loop
  // records it on the inbox row and retries the update
  bot.on("my_chat_member", handlePrivateChatMember);
}
