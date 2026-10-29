import { InlineKeyboard, type Api, type Context } from "grammy";
import { prisma, type TelegramGroup, type TelegramOutbox } from "@repo/database";
import {
  TELEGRAM_BOT_BUTTONS,
  TELEGRAM_BOT_STRINGS,
  TELEGRAM_LIMITS,
  type DmRuleKind,
} from "@repo/constants";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { findByTelegramId, isReachable } from "./accounts";
import { getTelegramBot, isTelegramConfigured, telegramBotId } from "./client";
import { emitTelegramEvent } from "./events";
import { enqueueOutbox, registerOutboxHandler } from "./loop";
import { creatorPoolIds, passingUserIds } from "./rules";

/**
 * Messaging on Telegram (Build Board #2), phase 2: gated creator groups (spec r3 3.2
 * to 3.6, boards tg5, tg9, tg10, tg13).
 *
 * - The bot finds the group: when a linked user makes it an admin (or adds it),
 *   my_chat_member creates a pending row the creator confirms on the card. A private
 *   invite link cannot be resolved through the Bot API, so nobody pastes one.
 * - Join requests on the approval only invite link are approved or declined against
 *   the group's rule, the same evaluator as Fan messages (rules.ts, until #21).
 * - An hourly check removes members who no longer qualify (ban then unban, so they
 *   can rejoin), at most 50 a run. The creator and the group's admins are exempt.
 * - The bot never posts in the group.
 */

export const GROUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export class GroupError extends Error {
  constructor(
    readonly code:
      | "off"
      | "not_found"
      | "not_admin"
      | "not_your_group"
      | "limit"
      | "not_linked"
      | "bad_rule",
    message?: string
  ) {
    super(message ?? code);
  }
}

function bot() {
  const instance = getTelegramBot();
  if (!instance) throw new GroupError("off");
  return instance;
}

function pageUrl(handle: string) {
  return `${env.LANDINGPAGE_URL.replace(/\/+$/, "")}/${encodeURIComponent(handle)}`;
}

function linkUrl() {
  return `${env.APP_URL.replace(/\/+$/, "")}/account?open=connected-apps&link=telegram`;
}

type Rights = { isAdmin: boolean; canInvite: boolean; canRestrict: boolean };

function rightsOf(member: { status: string } & Record<string, unknown>): Rights {
  if (member.status === "creator") return { isAdmin: true, canInvite: true, canRestrict: true };
  if (member.status !== "administrator") {
    return { isAdmin: false, canInvite: false, canRestrict: false };
  }
  return {
    isAdmin: true,
    canInvite: member.can_invite_users === true,
    canRestrict: member.can_restrict_members === true,
  };
}

/** The bot can gate the group: admin with Invite users and Ban users. */
export function botCanGate(rights: Rights) {
  return rights.isAdmin && rights.canInvite && rights.canRestrict;
}

async function botRights(api: Api, chatId: bigint): Promise<Rights> {
  const botId = telegramBotId();
  if (!botId) return { isAdmin: false, canInvite: false, canRestrict: false };
  const member = await api.getChatMember(Number(chatId), botId);
  return rightsOf(member as never);
}

/** Groups a creator can see on the card: pending and connected, never disconnected. */
export async function listCreatorGroups(creatorUserId: number) {
  return prisma.telegramGroup.findMany({
    where: { creatorUserId, disconnectedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

export async function connectedGroupCount(creatorUserId: number) {
  return prisma.telegramGroup.count({
    where: { creatorUserId, disconnectedAt: null, connectedAt: { not: null } },
  });
}

/** First connected group of a creator, for the Join group block and j_ links. */
export async function primaryGroup(creatorUserId: number) {
  return prisma.telegramGroup.findFirst({
    where: { creatorUserId, disconnectedAt: null, connectedAt: { not: null } },
    orderBy: { connectedAt: "asc" },
  });
}

// ----------------------------------------------------------------------------
// The bot joins or changes rights in a group
// ----------------------------------------------------------------------------

/** my_chat_member in a group or supergroup. Creates or refreshes the pending row. */
export async function handleGroupChatMember(ctx: Context) {
  const update = ctx.myChatMember;
  if (!update) return;
  const chat = update.chat;
  if (chat.type !== "group" && chat.type !== "supergroup") return;
  const chatId = BigInt(chat.id);
  const status = update.new_chat_member.status;
  const existing = await prisma.telegramGroup.findUnique({ where: { tgChatId: chatId } });

  if (status === "left" || status === "kicked") {
    if (existing) {
      await prisma.telegramGroup.update({
        where: { id: existing.id },
        data: { botIsAdmin: false },
      });
    }
    return;
  }

  const rights = rightsOf(update.new_chat_member as never);
  const canGate = botCanGate(rights);
  const title = (chat.title ?? "Telegram group").slice(0, 128);
  const adder = await findByTelegramId(update.from.id);

  if (existing) {
    await prisma.telegramGroup.update({
      where: { id: existing.id },
      data: { botIsAdmin: canGate, title },
    });
  } else if (adder) {
    await prisma.telegramGroup.create({
      data: {
        id: uuidv7(),
        creatorUserId: adder.userId,
        tgChatId: chatId,
        title,
        botIsAdmin: canGate,
        addedByTelegramUserId: BigInt(update.from.id),
      },
    });
  }

  // One private note to whoever added the bot, when the bot may write to them
  if (adder && isReachable(adder) && !existing?.connectedAt) {
    await enqueueOutbox(
      "notice",
      {
        text: canGate
          ? TELEGRAM_BOT_STRINGS.botAddedAdmin(title)
          : TELEGRAM_BOT_STRINGS.botAddedNoAdmin,
      },
      { chatId: update.from.id }
    );
  }
}

/** A basic group became a supergroup: Telegram gives it a new id. */
export async function handleChatMigration(ctx: Context) {
  const message = ctx.message;
  if (!message?.migrate_to_chat_id) return;
  await prisma.telegramGroup.updateMany({
    where: { tgChatId: BigInt(message.chat.id) },
    data: { tgChatId: BigInt(message.migrate_to_chat_id) },
  });
}

// ----------------------------------------------------------------------------
// The creator connects, changes, checks or disconnects a group (telegram.groups)
// ----------------------------------------------------------------------------

async function creatorTelegramId(creatorUserId: number): Promise<bigint> {
  const account = await prisma.telegramAccount.findUnique({ where: { userId: creatorUserId } });
  if (!account) throw new GroupError("not_linked");
  return account.telegramUserId;
}

function validRule(ruleKind: DmRuleKind, stakeMin: string | null | undefined) {
  if (ruleKind === "STAKE_MIN" && !/^0*[1-9]\d{0,29}$/.test(stakeMin ?? "")) {
    throw new GroupError("bad_rule");
  }
  if (ruleKind === "PAID_MEMBER") throw new GroupError("bad_rule");
}

/** Verify rights, build the approval only link and mark the group connected. */
async function finishConnect(
  group: TelegramGroup,
  creatorUserId: number,
  ruleKind: DmRuleKind,
  stakeMin: string | null
) {
  const api = bot().api;
  const ownerTg = await creatorTelegramId(creatorUserId);
  const owner = await api.getChatMember(Number(group.tgChatId), Number(ownerTg));
  if (!rightsOf(owner as never).isAdmin) throw new GroupError("not_your_group");
  const rights = await botRights(api, group.tgChatId);
  if (!botCanGate(rights)) {
    await prisma.telegramGroup.update({ where: { id: group.id }, data: { botIsAdmin: false } });
    throw new GroupError("not_admin");
  }
  const invite = await api.createChatInviteLink(Number(group.tgChatId), {
    name: "Amped.Bio",
    creates_join_request: true,
  });
  const count = await api.getChatMemberCount(Number(group.tgChatId)).catch(() => 0);
  const connected = await prisma.telegramGroup.update({
    where: { id: group.id },
    data: {
      creatorUserId,
      ruleKind,
      stakeMin: ruleKind === "STAKE_MIN" ? stakeMin : null,
      inviteLink: invite.invite_link,
      botIsAdmin: true,
      memberCount: count,
      connectedAt: new Date(),
      disconnectedAt: null,
      lastCheckedAt: new Date(),
    },
  });
  emitTelegramEvent("group_connected", { rule_kind: ruleKind });
  return connected;
}

async function assertUnderLimit(creatorUserId: number) {
  if ((await connectedGroupCount(creatorUserId)) >= TELEGRAM_LIMITS.groupsPerCreator) {
    throw new GroupError("limit");
  }
}

/** Confirm a pending group the bot found (the detected flow). */
export async function connectGroup(
  creatorUserId: number,
  groupId: Uint8Array,
  ruleKind: DmRuleKind,
  stakeMin: string | null
) {
  validRule(ruleKind, stakeMin);
  const group = await prisma.telegramGroup.findUnique({ where: { id: Buffer.from(groupId) } });
  if (!group || group.creatorUserId !== creatorUserId) throw new GroupError("not_found");
  if (!group.connectedAt) await assertUnderLimit(creatorUserId);
  return finishConnect(group, creatorUserId, ruleKind, stakeMin);
}

/** Connect a public group by @username or t.me/username. Private links are refused. */
export async function connectPublicGroup(
  creatorUserId: number,
  reference: string,
  ruleKind: DmRuleKind,
  stakeMin: string | null
) {
  validRule(ruleKind, stakeMin);
  const username = parsePublicGroupRef(reference);
  if (!username) throw new GroupError("not_found");
  await assertUnderLimit(creatorUserId);
  const api = bot().api;
  let chat: Awaited<ReturnType<Api["getChat"]>>;
  try {
    chat = await api.getChat(`@${username}`);
  } catch {
    throw new GroupError("not_found");
  }
  if (chat.type !== "group" && chat.type !== "supergroup") throw new GroupError("not_found");
  const chatId = BigInt(chat.id);
  const existing = await prisma.telegramGroup.findUnique({ where: { tgChatId: chatId } });
  if (existing && existing.creatorUserId !== creatorUserId && existing.connectedAt) {
    throw new GroupError("not_your_group");
  }
  const group =
    existing ??
    (await prisma.telegramGroup.create({
      data: {
        id: uuidv7(),
        creatorUserId,
        tgChatId: chatId,
        title: ("title" in chat && chat.title ? chat.title : username).slice(0, 128),
        addedByTelegramUserId: await creatorTelegramId(creatorUserId),
      },
    }));
  return finishConnect(group, creatorUserId, ruleKind, stakeMin);
}

/**
 * `@name`, `name` or `t.me/name` for a public group. A `t.me/+...` or `joinchat` link
 * is private and returns null (spec r3 3.2, Full QA F1).
 */
export function parsePublicGroupRef(reference: string): string | null {
  const value = reference.trim();
  if (/t\.me\/(\+|joinchat)/i.test(value)) return null;
  const name = value
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?(t|telegram)\.me\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name) ? name : null;
}

async function ownGroup(creatorUserId: number, groupId: Uint8Array) {
  const group = await prisma.telegramGroup.findUnique({ where: { id: Buffer.from(groupId) } });
  if (!group || group.creatorUserId !== creatorUserId || group.disconnectedAt) {
    throw new GroupError("not_found");
  }
  return group;
}

/** Linked members who fail `rule`, of the active members the bot knows. */
async function failingMembers(group: TelegramGroup, ruleKind: DmRuleKind, stakeMin: string | null) {
  const members = await prisma.telegramGroupMember.findMany({
    where: { groupId: group.id, removedAt: null, userId: { not: null } },
  });
  const ids = members.map(m => m.userId!).filter(id => id !== group.creatorUserId);
  const passing = await passingUserIds(
    ruleKind,
    {
      creatorUserId: group.creatorUserId,
      poolIds: await creatorPoolIds(group.creatorUserId),
      stakeMin,
    },
    ids
  );
  return members.filter(m => m.userId !== group.creatorUserId && !passing.has(m.userId!));
}

/** How many members a rule change would remove at the next check (the Change dialog). */
export async function previewRule(
  creatorUserId: number,
  groupId: Uint8Array,
  ruleKind: DmRuleKind,
  stakeMin: string | null
) {
  validRule(ruleKind, stakeMin);
  const group = await ownGroup(creatorUserId, groupId);
  return { wouldRemove: (await failingMembers(group, ruleKind, stakeMin)).length };
}

export async function setGroupRule(
  creatorUserId: number,
  groupId: Uint8Array,
  ruleKind: DmRuleKind,
  stakeMin: string | null
) {
  validRule(ruleKind, stakeMin);
  const group = await ownGroup(creatorUserId, groupId);
  const updated = await prisma.telegramGroup.update({
    where: { id: group.id },
    data: { ruleKind, stakeMin: ruleKind === "STAKE_MIN" ? stakeMin : null },
  });
  await queueGroupCheck(updated.id);
  return updated;
}

export async function setRemoveUnverified(
  creatorUserId: number,
  groupId: Uint8Array,
  value: boolean
) {
  const group = await ownGroup(creatorUserId, groupId);
  return prisma.telegramGroup.update({
    where: { id: group.id },
    data: { removeUnverified: value },
  });
}

export async function disconnectGroup(creatorUserId: number, groupId: Uint8Array) {
  const group = await ownGroup(creatorUserId, groupId);
  if (group.inviteLink) {
    try {
      await bot().api.revokeChatInviteLink(Number(group.tgChatId), group.inviteLink);
    } catch (error) {
      // The bot may already be gone; the row is disconnected either way
      console.error("[telegram] revoke invite link failed", error);
    }
  }
  return prisma.telegramGroup.update({
    where: { id: group.id },
    data: { disconnectedAt: new Date(), inviteLink: null },
  });
}

/** Totals for the card: approvals, declines and removals in the past 7 days. */
export async function groupWeek(groupId: Uint8Array, now = new Date()) {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const id = Buffer.from(groupId);
  const [approved, declined, removed] = await Promise.all([
    prisma.telegramGroupMember.count({ where: { groupId: id, approvedAt: { gte: since } } }),
    prisma.telegramGroupMember.count({ where: { groupId: id, declinedAt: { gte: since } } }),
    prisma.telegramGroupMember.count({
      where: { groupId: id, removedAt: { gte: since }, removedReason: { not: "left" } },
    }),
  ]);
  return { approved, declined, removed };
}

// ----------------------------------------------------------------------------
// Join requests and member updates
// ----------------------------------------------------------------------------

async function upsertMember(
  groupId: Uint8Array,
  telegramUserId: bigint,
  data: {
    userId?: number | null;
    approvedAt?: Date | null;
    declinedAt?: Date | null;
    removedAt?: Date | null;
    removedReason?: string | null;
    lastVerifiedAt?: Date | null;
  }
) {
  const id = Buffer.from(groupId);
  await prisma.telegramGroupMember.upsert({
    where: { groupId_telegramUserId: { groupId: id, telegramUserId } },
    create: { id: uuidv7(), groupId: id, telegramUserId, ...data },
    update: data,
  });
}

function declineText(rule: DmRuleKind, creatorName: string) {
  const s = TELEGRAM_BOT_STRINGS.groupDeclined;
  if (rule === "PAID_MEMBER") return s.PAID_MEMBER(creatorName);
  if (rule === "POOL_MEMBER") return s.POOL_MEMBER(creatorName);
  if (rule === "STAKE_MIN") return s.STAKE_MIN(creatorName);
  return s.FOLLOWER(creatorName);
}

/** Whether one Amped user may sit in the group under its rule. */
export async function qualifies(group: TelegramGroup, userId: number) {
  if (userId === group.creatorUserId) return true;
  const passing = await passingUserIds(
    group.ruleKind as DmRuleKind,
    {
      creatorUserId: group.creatorUserId,
      poolIds: await creatorPoolIds(group.creatorUserId),
      stakeMin: group.stakeMin,
    },
    [userId]
  );
  return passing.has(userId);
}

/** chat_join_request on the approval only link (acceptance 12). */
export async function handleJoinRequest(ctx: Context) {
  const request = ctx.chatJoinRequest;
  if (!request) return;
  const group = await prisma.telegramGroup.findUnique({
    where: { tgChatId: BigInt(request.chat.id) },
    include: { creator: { select: { name: true, handle: true } } },
  });
  // A group Amped does not gate is left to its admins
  if (!group || !group.connectedAt || group.disconnectedAt) return;
  const api = ctx.api;
  const applicant = BigInt(request.from.id);
  const dm = request.user_chat_id;
  const creator = (group as unknown as { creator: { name: string; handle: string | null } })
    .creator;
  const account = await findByTelegramId(request.from.id);

  if (!account) {
    await api.declineChatJoinRequest(request.chat.id, request.from.id);
    await upsertMember(group.id, applicant, { declinedAt: new Date() });
    emitTelegramEvent("group_join_decided", { decision: "declined", reason: "not_linked" });
    await api
      .sendMessage(dm, TELEGRAM_BOT_STRINGS.groupNotLinked(creator.name), {
        reply_markup: new InlineKeyboard().url(TELEGRAM_BOT_BUTTONS.linkTelegram, linkUrl()),
      })
      .catch(() => undefined);
    return;
  }

  if (await qualifies(group, account.userId)) {
    await api.approveChatJoinRequest(request.chat.id, request.from.id);
    await upsertMember(group.id, applicant, {
      userId: account.userId,
      approvedAt: new Date(),
      removedAt: null,
      removedReason: null,
      lastVerifiedAt: new Date(),
    });
    emitTelegramEvent("group_join_decided", { decision: "approved", reason: "rule_passed" });
    await api.sendMessage(dm, TELEGRAM_BOT_STRINGS.groupApproved(creator.name)).catch(() => {});
    return;
  }

  await api.declineChatJoinRequest(request.chat.id, request.from.id);
  await upsertMember(group.id, applicant, { userId: account.userId, declinedAt: new Date() });
  emitTelegramEvent("group_join_decided", { decision: "declined", reason: "rule_failed" });
  const keyboard = creator.handle
    ? new InlineKeyboard().url(
        TELEGRAM_BOT_BUTTONS.openCreatorPage(creator.name),
        pageUrl(creator.handle)
      )
    : undefined;
  await api
    .sendMessage(dm, declineText(group.ruleKind as DmRuleKind, creator.name), {
      ...(keyboard ? { reply_markup: keyboard } : {}),
    })
    .catch(() => undefined);
}

/**
 * chat_member in a gated group: a member joined or left. The bot learns about
 * members only this way and through join requests; it cannot list a group.
 */
export async function handleGroupMemberUpdate(ctx: Context) {
  const update = ctx.chatMember;
  if (!update) return;
  if (update.chat.type !== "group" && update.chat.type !== "supergroup") return;
  const group = await prisma.telegramGroup.findUnique({
    where: { tgChatId: BigInt(update.chat.id) },
  });
  if (!group || !group.connectedAt || group.disconnectedAt) return;
  const member = update.new_chat_member;
  if (member.user.is_bot) return;
  const telegramUserId = BigInt(member.user.id);
  if (member.status === "left" || member.status === "kicked") {
    const existing = await prisma.telegramGroupMember.findUnique({
      where: { groupId_telegramUserId: { groupId: group.id, telegramUserId } },
    });
    // A removal the check made keeps its reason
    if (existing && !existing.removedAt) {
      await prisma.telegramGroupMember.update({
        where: { id: existing.id },
        data: { removedAt: new Date(), removedReason: "left" },
      });
    }
    return;
  }
  if (member.status === "member" || member.status === "restricted") {
    const account = await findByTelegramId(member.user.id);
    await upsertMember(group.id, telegramUserId, {
      userId: account?.userId ?? null,
      removedAt: null,
      removedReason: null,
    });
  }
}

// ----------------------------------------------------------------------------
// The hourly check (spec 3.6, acceptance 13)
// ----------------------------------------------------------------------------

/** Queue one check for a group unless one is already waiting. */
export async function queueGroupCheck(groupId: Uint8Array) {
  const refId = Buffer.from(groupId);
  const waiting = await prisma.telegramOutbox.findFirst({
    where: { kind: "group_check", refId, status: { in: ["PENDING", "CLAIMED"] } },
    select: { id: true },
  });
  if (waiting) return false;
  await enqueueOutbox("group_check", { groupId: refId.toString("hex") }, { refId });
  return true;
}

/** Queue checks for connected groups not checked within the hour. */
export async function queueDueGroupChecks(now = new Date()) {
  const due = await prisma.telegramGroup.findMany({
    where: {
      connectedAt: { not: null },
      disconnectedAt: null,
      OR: [
        { lastCheckedAt: null },
        { lastCheckedAt: { lt: new Date(now.getTime() - GROUP_CHECK_INTERVAL_MS) } },
      ],
    },
    select: { id: true },
    take: 200,
  });
  let queued = 0;
  for (const group of due) if (await queueGroupCheck(group.id)) queued += 1;
  return queued;
}

async function remove(
  api: Api,
  group: TelegramGroup,
  telegramUserId: bigint,
  reason: "rule_failed" | "unlinked" | "unverified",
  memberId: Uint8Array,
  creatorName: string
) {
  await api.banChatMember(Number(group.tgChatId), Number(telegramUserId));
  await api.unbanChatMember(Number(group.tgChatId), Number(telegramUserId), {
    only_if_banned: true,
  });
  await prisma.telegramGroupMember.update({
    where: { id: Buffer.from(memberId) },
    data: { removedAt: new Date(), removedReason: reason },
  });
  emitTelegramEvent("group_member_removed", { reason });
  // One message, only to a member the bot may write to
  if (reason === "rule_failed") {
    const account = await findByTelegramId(telegramUserId);
    if (isReachable(account)) {
      await api
        .sendMessage(Number(telegramUserId), TELEGRAM_BOT_STRINGS.groupRemoved(creatorName))
        .catch(() => undefined);
    }
  }
}

/** Outbox handler for kind group_check. */
export async function runGroupCheck(job: TelegramOutbox) {
  if (!job.refId) return;
  const group = await prisma.telegramGroup.findUnique({
    where: { id: Buffer.from(job.refId) },
    include: { creator: { select: { name: true } } },
  });
  if (!group || !group.connectedAt || group.disconnectedAt) return;
  const creatorName = (group as unknown as { creator: { name: string } }).creator.name;
  const api = bot().api;
  const chatId = Number(group.tgChatId);
  const now = new Date();

  const rights = await botRights(api, group.tgChatId);
  if (!botCanGate(rights)) {
    await prisma.telegramGroup.update({
      where: { id: group.id },
      data: { botIsAdmin: false, lastCheckedAt: now },
    });
    return;
  }

  const admins = await api.getChatAdministrators(chatId);
  const exempt = new Set(admins.map(admin => BigInt(admin.user.id)));
  const ownerAccount = await prisma.telegramAccount.findUnique({
    where: { userId: group.creatorUserId },
  });
  if (ownerAccount) exempt.add(ownerAccount.telegramUserId);

  const members = await prisma.telegramGroupMember.findMany({
    where: { groupId: group.id, removedAt: null },
  });
  const active = members.filter(m => !exempt.has(BigInt(m.telegramUserId)));

  // Re-map each member to an Amped account: an unlinked fan has no account any more
  const accounts = await prisma.telegramAccount.findMany({
    where: { telegramUserId: { in: active.map(m => BigInt(m.telegramUserId)) } },
    select: { telegramUserId: true, userId: true },
  });
  const byTelegram = new Map(accounts.map(a => [BigInt(a.telegramUserId), a.userId]));
  const linkedIds = Array.from(new Set(accounts.map(a => a.userId)));
  const passing = await passingUserIds(
    group.ruleKind as DmRuleKind,
    {
      creatorUserId: group.creatorUserId,
      poolIds: await creatorPoolIds(group.creatorUserId),
      stakeMin: group.stakeMin,
    },
    linkedIds
  );

  let removed = 0;
  for (const member of active) {
    if (removed >= TELEGRAM_LIMITS.groupRemovalsPerRun) break;
    const tgId = BigInt(member.telegramUserId);
    const userId = byTelegram.get(tgId);
    let reason: "rule_failed" | "unlinked" | "unverified" | null = null;
    if (userId === undefined) {
      if (member.userId !== null) reason = "unlinked";
      else if (group.removeUnverified) reason = "unverified";
    } else if (userId !== group.creatorUserId && !passing.has(userId)) {
      reason = "rule_failed";
    }
    if (!reason) {
      await prisma.telegramGroupMember.update({
        where: { id: member.id },
        data: { lastVerifiedAt: now, ...(userId !== undefined ? { userId } : {}) },
      });
      continue;
    }
    try {
      await remove(api, group, tgId, reason, member.id, creatorName);
      removed += 1;
    } catch (error) {
      console.error("[telegram] group removal failed", error);
    }
  }

  const count = await api.getChatMemberCount(chatId).catch(() => group.memberCount);
  await prisma.telegramGroup.update({
    where: { id: group.id },
    data: { botIsAdmin: true, memberCount: count, lastCheckedAt: now },
  });
}

// ----------------------------------------------------------------------------
// The public side: the Join group block and j_ links
// ----------------------------------------------------------------------------

export type TelegramGroupDoor = {
  open: boolean;
  ruleKind: DmRuleKind;
  botUsername: string | null;
  linkCode: string | null;
};

/** /start j_{code}: send the invite to a fan who qualifies, the reason otherwise. */
export async function handleJoinStart(
  ctx: Context,
  account: { userId: number },
  creatorUserId: number
) {
  const creator = await prisma.user.findFirst({
    where: { id: creatorUserId, page_status: "PUBLISHED", block: "no" },
    select: { id: true, name: true, handle: true },
  });
  if (!creator) {
    await ctx.reply(TELEGRAM_BOT_STRINGS.dmNotFound);
    return;
  }
  const group = await primaryGroup(creator.id);
  if (!group || !group.inviteLink) {
    await ctx.reply(TELEGRAM_BOT_STRINGS.groupNotOpen(creator.name));
    return;
  }
  if (await qualifies(group, account.userId)) {
    await ctx.reply(TELEGRAM_BOT_STRINGS.groupInvite(creator.name), {
      reply_markup: new InlineKeyboard().url(TELEGRAM_BOT_BUTTONS.joinGroup, group.inviteLink),
    });
    return;
  }
  const keyboard = creator.handle
    ? new InlineKeyboard().url(
        TELEGRAM_BOT_BUTTONS.openCreatorPage(creator.name),
        pageUrl(creator.handle)
      )
    : undefined;
  await ctx.reply(declineText(group.ruleKind as DmRuleKind, creator.name), {
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

let registered = false;
/** Register the phase 2 outbox handler. Called once from bootstrap.ts. */
export function registerGroupOutboxHandlers() {
  if (registered) return;
  registered = true;
  registerOutboxHandler("group_check", runGroupCheck);
}

const SCHEDULE_MS = 5 * 60 * 1000;
let scheduler: NodeJS.Timeout | null = null;

/** Every 5 minutes, queue the hourly checks that are due. No-op until TELEGRAM_GROUPS. */
export function startGroupChecks() {
  if (scheduler || process.env.NODE_ENV === "test") return;
  if (!env.TELEGRAM_GROUPS || !isTelegramConfigured()) return;
  scheduler = setInterval(() => {
    void queueDueGroupChecks().catch(error =>
      console.error("[telegram] group check scheduling failed", error)
    );
  }, SCHEDULE_MS);
  scheduler.unref();
}

export function stopGroupChecks() {
  if (scheduler) clearInterval(scheduler);
  scheduler = null;
}
