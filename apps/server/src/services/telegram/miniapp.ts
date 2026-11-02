import { prisma } from "@repo/database";
import {
  DM_RULE_LABELS,
  TELEGRAM_BOT_STRINGS,
  TELEGRAM_MINIAPP_OPEN_GROUP_RULES,
  isMiniAppSafeBlock,
  isRenderable,
  miniAppBannedWord,
  parseTelegramStartPayload,
  sanitizeRichText,
  telegramPayload,
  type BlockType,
  type DmRuleKind,
  type ThemeConfig,
} from "@repo/constants";
import { env } from "../../env";
import { cache } from "../../utils/cache";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { sanitizeBlockConfig } from "../../utils/sanitizeBlockConfig";
import { getCreatorSettings, settingsOpen } from "../messaging/access";
import { findByTelegramId } from "./accounts";
import { getBotUsername, getTelegramBot } from "./client";
import { emitTelegramEvent } from "./events";
import { primaryGroup, qualifies } from "./groups";
import { cardKeyboard } from "./inline";
import { encodeLinkCode, userIdForLinkCode } from "./linkCodes";
import type { MiniAppUser } from "./initData";

/**
 * The Mini App (Build Board #2, phase 3, spec r3 3.7, board tg7, decisions
 * tg-miniapp-allowlist, tg-miniapp-gated-join and tg-miniapp-adult).
 *
 * Telegram binds Mini Apps with crypto to TON, so the page is built here, on the server,
 * under an allow list: only the block kinds in TELEGRAM_MINIAPP_BLOCK_KINDS, never a crypto
 * platform or host, never an 18+ item, never a block or bio whose words name a non TON
 * asset, a stake or a return. Join group shows only for groups open to followers or
 * anyone, or to a viewer who already qualifies, and never with a pool or stake word.
 * The pool stats footer never renders, and Made with Amped.Bio is plain text whenever
 * anything was left out.
 */

/** The direct link app name set in BotFather (t.me/<bot>/bio). */
export const MINIAPP_SHORT_NAME = "bio";

export class MiniAppError extends Error {
  constructor(readonly code: "off" | "not_found" | "not_linked" | "self" | "blocked") {
    super(code);
  }
}

export type MiniAppBlock =
  | { id: number; kind: "text"; config: unknown }
  | { id: number; kind: "link"; config: unknown }
  | { id: number; kind: "media"; config: unknown }
  | { id: number; kind: "follow" }
  | { id: number; kind: "followers"; count: number }
  | { id: number; kind: "join_group"; link: string; rule: string | null };

export type MiniAppPage = {
  creator: { name: string; handle: string; image: string | null; bio: string };
  theme: ThemeConfig | null;
  blocks: MiniAppBlock[];
  /** MainButton target when Fan messages is open: t.me/<bot>?start=m_{code} */
  messageLink: string | null;
  /** Direct link with the viewer's own code for shares */
  shareLink: string | null;
  /** Any block or the bio was left out: Made with Amped.Bio stays plain text */
  skipped: boolean;
  viewer: { linked: boolean; following: boolean };
};

/** The creator a p_{code} start param names, published and not suspended. */
async function creatorFromStartParam(startParam: string | null) {
  const payload = parseTelegramStartPayload(startParam);
  if (payload.kind !== "page") throw new MiniAppError("not_found");
  const creatorId = await userIdForLinkCode(payload.code);
  if (creatorId === null) throw new MiniAppError("not_found");
  const creator = await prisma.user.findFirst({
    where: { id: creatorId, page_status: "PUBLISHED", block: "no", handle: { not: null } },
  });
  if (!creator?.handle) throw new MiniAppError("not_found");
  return { ...creator, handle: creator.handle };
}

async function publicTheme(themeId: string | null): Promise<ThemeConfig | null> {
  const id = Number(themeId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const theme = await prisma.theme.findUnique({ where: { id } });
  const config = (theme?.config ?? null) as ThemeConfig | null;
  if (config?.background?.fileId) {
    config.background.value = await getFileUrl({
      legacyImageField: null,
      imageFileId: config.background.fileId,
    });
  }
  return config;
}

/** Every string a block would show, for the banned word check. */
function blockText(config: unknown): string {
  const record = (config ?? {}) as Record<string, unknown>;
  return ["label", "content", "text", "title", "url"]
    .map(key => (typeof record[key] === "string" ? (record[key] as string) : ""))
    .join(" ")
    .replace(/<[^>]*>/g, " ");
}

function pageUrl(handle: string) {
  return `${env.LANDINGPAGE_URL.replace(/\/+$/, "")}/${encodeURIComponent(handle)}`;
}

/** telegram.miniapp.page: the creator's page under the allow list. */
export async function buildMiniAppPage(
  viewer: MiniAppUser,
  startParam: string | null
): Promise<MiniAppPage> {
  if (!env.TELEGRAM_MINIAPP || !env.TELEGRAM_ENABLED) throw new MiniAppError("off");
  const creator = await creatorFromStartParam(startParam);
  const [account, botUsername, rows, settings, theme, image] = await Promise.all([
    findByTelegramId(viewer.id),
    getBotUsername(),
    prisma.block.findMany({ where: { user_id: creator.id }, orderBy: { order: "asc" } }),
    getCreatorSettings(creator.id),
    publicTheme(creator.theme),
    getFileUrl({ legacyImageField: creator.image, imageFileId: creator.image_file_id }).catch(
      () => null
    ),
  ]);
  const viewerId = account?.userId ?? null;

  let skipped = false;
  const blocks: MiniAppBlock[] = [];
  for (const row of rows) {
    const block = {
      id: row.id,
      type: row.type,
      order: row.order,
      config: sanitizeBlockConfig(row.type, row.config),
    } as BlockType;
    if (!isRenderable(block)) continue;
    const config = block.config as Record<string, unknown> | null;
    const safe =
      isMiniAppSafeBlock({ ...block, adult: config?.adult === true }) &&
      miniAppBannedWord(blockText(config)) === null;
    if (!safe) {
      skipped = true;
      continue;
    }
    if (block.type === "text" || block.type === "link" || block.type === "media") {
      blocks.push({ id: block.id, kind: block.type, config });
    } else if (block.type === "follow") {
      blocks.push({ id: block.id, kind: "follow" });
    } else if (block.type === "followers") {
      if (!creator.show_follower_count) continue;
      const count = await prisma.follow.count({ where: { creator_id: creator.id } });
      blocks.push({ id: block.id, kind: "followers", count });
    } else if (block.type === "telegram_group") {
      // Join group: open groups for anyone, gated ones only for a viewer who qualifies
      if (!env.TELEGRAM_GROUPS || !botUsername) continue;
      const group = await primaryGroup(creator.id);
      if (!group?.inviteLink) continue;
      const rule = group.ruleKind as DmRuleKind;
      const open = (TELEGRAM_MINIAPP_OPEN_GROUP_RULES as readonly string[]).includes(rule);
      if (!open && !(viewerId && (await qualifies(group, viewerId)))) continue;
      blocks.push({
        id: block.id,
        kind: "join_group",
        link: `https://t.me/${botUsername}?start=${telegramPayload.join(encodeLinkCode(creator.id))}`,
        rule: rule === "FOLLOWER" ? DM_RULE_LABELS.FOLLOWER : null,
      });
    }
    // telegram_message becomes the MainButton below
  }

  const hasMessageBlock = rows.some(row => row.type === "telegram_message");
  const messageLink =
    hasMessageBlock && botUsername && settingsOpen(settings)
      ? `https://t.me/${botUsername}?start=${telegramPayload.message(encodeLinkCode(creator.id))}`
      : null;

  const bioRaw = sanitizeRichText(creator.description ?? "");
  const bioHidden = miniAppBannedWord(bioRaw.replace(/<[^>]*>/g, " ")) !== null;
  if (bioHidden) skipped = true;

  const following = viewerId
    ? (await prisma.follow.count({
        where: { follower_id: viewerId, creator_id: creator.id },
      })) > 0
    : false;
  const sharerCode = viewerId ? encodeLinkCode(viewerId) : null;
  const shareLink = botUsername
    ? `https://t.me/${botUsername}/${MINIAPP_SHORT_NAME}?startapp=${telegramPayload.page(
        encodeLinkCode(creator.id),
        sharerCode
      )}`
    : null;

  emitTelegramEvent("miniapp_opened", { linked: !!viewerId });
  return {
    creator: {
      name: creator.name,
      handle: creator.handle,
      image: image ?? null,
      bio: bioHidden ? "" : bioRaw,
    },
    theme,
    blocks,
    messageLink,
    shareLink,
    skipped,
    viewer: { linked: !!viewerId, following },
  };
}

/** telegram.miniapp.follow: a linked viewer follows the creator from inside Telegram. */
export async function miniAppFollow(viewer: MiniAppUser, startParam: string | null) {
  if (!env.TELEGRAM_MINIAPP || !env.TELEGRAM_ENABLED) throw new MiniAppError("off");
  const creator = await creatorFromStartParam(startParam);
  const account = await findByTelegramId(viewer.id);
  if (!account) throw new MiniAppError("not_linked");
  if (account.userId === creator.id) throw new MiniAppError("self");
  const blocked = await prisma.followBlock.findUnique({
    where: { creator_id_user_id: { creator_id: creator.id, user_id: account.userId } },
  });
  if (blocked) throw new MiniAppError("blocked");
  await prisma.follow.upsert({
    where: { follower_id_creator_id: { follower_id: account.userId, creator_id: creator.id } },
    update: {},
    create: { follower_id: account.userId, creator_id: creator.id, source: "telegram" },
  });
  // Same key as follow.blockData in trpc/follow.ts: forget the creator's cached cards
  try {
    await cache.set(`follow:block:ver:${creator.id}`, Date.now(), 24 * 60 * 60);
  } catch {
    // Best effort; a stale card costs one recompute
  }
  emitTelegramEvent("miniapp_follow", {});
  return { following: true };
}

/**
 * telegram.miniapp.prepareShare: a prepared inline message of the creator's card for
 * WebApp.shareMessage. The same card as inline mode, with the buttons that work.
 */
export async function prepareMiniAppShare(viewer: MiniAppUser, startParam: string | null) {
  if (!env.TELEGRAM_MINIAPP || !env.TELEGRAM_ENABLED) throw new MiniAppError("off");
  const creator = await creatorFromStartParam(startParam);
  const bot = getTelegramBot();
  const botUsername = await getBotUsername();
  if (!bot || !botUsername) throw new MiniAppError("off");
  const [settings, followers, thumbnail] = await Promise.all([
    getCreatorSettings(creator.id),
    prisma.follow.count({ where: { creator_id: creator.id } }),
    getFileUrl({ legacyImageField: creator.image, imageFileId: creator.image_file_id }).catch(
      () => null
    ),
  ]);
  const open = settingsOpen(settings);
  const line = open
    ? TELEGRAM_BOT_STRINGS.inlineCardLine(followers)
    : TELEGRAM_BOT_STRINGS.inlineCardLineNoMessages(followers);
  const prepared = await bot.api.savePreparedInlineMessage(
    viewer.id,
    {
      type: "article",
      id: `s${creator.id}`,
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
    },
    { allow_user_chats: true, allow_group_chats: true, allow_channel_chats: true }
  );
  emitTelegramEvent("miniapp_share", { kind: "message" });
  return { id: prepared.id, pageUrl: pageUrl(creator.handle) };
}
