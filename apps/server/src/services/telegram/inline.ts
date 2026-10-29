import { InlineKeyboard, type Context } from "grammy";
import type { InlineQueryResult } from "grammy/types";
import { prisma } from "@repo/database";
import {
  TELEGRAM_BOT_BUTTONS,
  TELEGRAM_BOT_STRINGS,
  TELEGRAM_LIMITS,
  telegramPayload,
} from "@repo/constants";
import { env } from "../../env";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { settingsOpen } from "../messaging/access";
import { emitTelegramEvent } from "./events";
import { primaryGroup } from "./groups";
import { encodeLinkCode } from "./linkCodes";

/**
 * Messaging on Telegram (Build Board #2), phase 2: inline cards (spec r3 3.5, board
 * tg8, decision tg-inline-scope). `@AmpedBioBot maya` in any chat lists published
 * creators whose handle starts with the query. Each card carries Open page always,
 * Message only when Fan messages is open, and Join group only with a connected group,
 * so no button leads to a refusal. Suspended and unpublished pages never appear. The
 * card shows the name, handle, follower count and avatar: never a content item, so
 * never an 18+ item.
 */

const CACHE_SECONDS = 300;

function pageUrl(handle: string) {
  return `${env.LANDINGPAGE_URL.replace(/\/+$/, "")}/${encodeURIComponent(handle)}`;
}

/** Published, not suspended, handle starts with the query (lowercase). */
export async function inlineCreators(query: string) {
  const prefix = query.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(prefix)) return [];
  return prisma.user.findMany({
    where: { handle: { startsWith: prefix }, page_status: "PUBLISHED", block: "no" },
    orderBy: { handle: "asc" },
    take: TELEGRAM_LIMITS.inlineResults,
    select: {
      id: true,
      name: true,
      handle: true,
      image: true,
      image_file_id: true,
      messagingSettings: true,
    },
  });
}

/** The inline keyboard for one creator: only buttons that work. */
export async function cardKeyboard(
  creator: { id: number; handle: string },
  messagesOpen: boolean,
  botUsername: string
) {
  const keyboard = new InlineKeyboard().url(TELEGRAM_BOT_BUTTONS.openPage, pageUrl(creator.handle));
  const code = encodeLinkCode(creator.id);
  if (messagesOpen) {
    keyboard
      .row()
      .url(
        TELEGRAM_BOT_BUTTONS.message,
        `https://t.me/${botUsername}?start=${telegramPayload.message(code)}`
      );
  }
  if (env.TELEGRAM_GROUPS && (await primaryGroup(creator.id))?.inviteLink) {
    keyboard
      .row()
      .url(
        TELEGRAM_BOT_BUTTONS.joinGroup,
        `https://t.me/${botUsername}?start=${telegramPayload.join(code)}`
      );
  }
  return keyboard;
}

/** inline_query: up to 10 creator cards. */
export async function handleInlineQuery(ctx: Context) {
  const query = ctx.inlineQuery;
  if (!query) return;
  if (!env.TELEGRAM_GROUPS) {
    await ctx.answerInlineQuery([], { cache_time: CACHE_SECONDS });
    return;
  }
  const botUsername = ctx.me.username;
  const creators = await inlineCreators(query.query);
  const counts = await Promise.all(
    creators.map(creator => prisma.follow.count({ where: { creator_id: creator.id } }))
  );
  const results: InlineQueryResult[] = [];
  for (const [index, creator] of creators.entries()) {
    if (!creator.handle) continue;
    const followers = counts[index] ?? 0;
    const open = settingsOpen(creator.messagingSettings);
    const line = open
      ? TELEGRAM_BOT_STRINGS.inlineCardLine(followers)
      : TELEGRAM_BOT_STRINGS.inlineCardLineNoMessages(followers);
    const thumbnail = await getFileUrl({
      legacyImageField: creator.image,
      imageFileId: creator.image_file_id,
    }).catch(() => null);
    results.push({
      type: "article" as const,
      id: `c${creator.id}`,
      title: creator.name,
      description: `@${creator.handle} on Amped.Bio. ${line}`,
      ...(thumbnail ? { thumbnail_url: thumbnail } : {}),
      input_message_content: {
        message_text: `${creator.name}\n@${creator.handle} on Amped.Bio\n${line}`,
      },
      reply_markup: await cardKeyboard(
        { id: creator.id, handle: creator.handle },
        open,
        botUsername
      ),
    });
  }
  emitTelegramEvent("inline_card_shown", { results: results.length });
  await ctx.answerInlineQuery(results, { cache_time: CACHE_SECONDS, is_personal: false });
}

/** chosen_inline_result: count the pick. Needs inline feedback on in BotFather. */
export async function handleChosenInline(ctx: Context) {
  if (!ctx.chosenInlineResult) return;
  emitTelegramEvent("inline_card_picked", {});
}
