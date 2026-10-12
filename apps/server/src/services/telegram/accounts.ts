import { prisma, type TelegramAccount } from "@repo/database";
import { CONSENT_POLICY_VERSION } from "@repo/constants";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";
import { decryptTelegramField, encryptTelegramField } from "./secret";

/**
 * Messaging on Telegram (Build Board #2), spec 3.3 and 3.8. The link between an
 * Amped user and a Telegram user, its history, and the user's Telegram delivery
 * choice. Every other Telegram module goes through here so the rules live in one
 * place: a Telegram id links to one Amped user, the bot only writes to a
 * reachable link, and a Telegram id never leaves the server except to its owner.
 */

export type LinkEventKind =
  | "linked"
  | "unlinked"
  | "bot_started"
  | "bot_blocked"
  | "bot_unblocked"
  | "updates_on"
  | "updates_off";

export type LinkEventSource =
  | "oidc"
  | "mini_app"
  | "start_command"
  | "my_chat_member"
  | "settings"
  | "stop_command";

/** The global NotificationPreference row is creatorUserId 0. */
export const GLOBAL_PREFERENCE = 0;

export async function recordLinkEvent(
  userId: number,
  telegramUserId: bigint,
  kind: LinkEventKind,
  source: LinkEventSource
) {
  const consent = kind === "updates_on" || kind === "updates_off";
  await prisma.telegramLinkEvent.create({
    data: {
      id: uuidv7(),
      userId,
      telegramUserId,
      kind,
      source,
      policyVersion: consent ? CONSENT_POLICY_VERSION : null,
    },
  });
}

/** The bot may write to this link: the user granted access and has not blocked the bot. */
export function isReachable(account: Pick<TelegramAccount, "botAccess" | "blockedAt"> | null) {
  return !!account && account.botAccess && account.blockedAt === null;
}

export async function findByTelegramId(telegramUserId: bigint | number) {
  return prisma.telegramAccount.findUnique({
    where: { telegramUserId: BigInt(telegramUserId) },
  });
}

export async function findByUserId(userId: number) {
  return prisma.telegramAccount.findUnique({ where: { userId } });
}

export class TelegramLinkConflictError extends Error {
  constructor() {
    super("telegram_id_linked_elsewhere");
  }
}

export type VerifiedTelegramIdentity = {
  telegramUserId: bigint;
  username: string | null;
  firstName: string | null;
  photoUrl: string | null;
  botAccess: boolean;
};

/**
 * Link a verified Telegram identity to an Amped user (acceptance 1). Refuses a
 * Telegram id already linked to another user. Relinking the same user refreshes
 * the profile fields and keeps the user's own settings.
 */
export async function linkTelegram(userId: number, identity: VerifiedTelegramIdentity) {
  const existing = await findByTelegramId(identity.telegramUserId);
  if (existing && existing.userId !== userId) throw new TelegramLinkConflictError();

  const fields = {
    telegramUserId: identity.telegramUserId,
    username: encryptTelegramField(identity.username),
    firstName: encryptTelegramField(identity.firstName),
    photoUrl: encryptTelegramField(identity.photoUrl),
    blockedAt: null,
    lastSeenAt: new Date(),
  };
  const account = await prisma.telegramAccount.upsert({
    where: { userId },
    create: {
      id: uuidv7(),
      userId,
      botAccess: identity.botAccess,
      ...fields,
    },
    // A relink without the grant keeps an access the user gave earlier through Start
    update: identity.botAccess ? { ...fields, botAccess: true } : fields,
  });
  await recordLinkEvent(userId, identity.telegramUserId, "linked", "oidc");
  return account;
}

/**
 * Unlink (spec 3.4): delete the link, record it, turn Telegram delivery off on
 * every preference row. Message history stays in Amped. Returns the Telegram id
 * and whether the bot could still reach the user, so the caller can send the
 * one closing notice.
 */
export async function unlinkTelegram(userId: number) {
  const account = await findByUserId(userId);
  if (!account) return null;
  await prisma.$transaction([
    prisma.telegramAccount.delete({ where: { userId } }),
    prisma.notificationPreference.updateMany({
      where: { userId, creatorUserId: GLOBAL_PREFERENCE },
      data: { telegramEnabled: false },
    }),
    prisma.notificationPreference.updateMany({
      where: { userId, creatorUserId: { not: GLOBAL_PREFERENCE } },
      data: { telegramEnabled: null },
    }),
  ]);
  await recordLinkEvent(userId, account.telegramUserId, "unlinked", "settings");
  return { telegramUserId: account.telegramUserId, reachable: isReachable(account) };
}

/** The user's global Telegram delivery choice. Null or missing reads as off. */
export async function getGlobalTelegramDelivery(userId: number): Promise<boolean> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId_creatorUserId: { userId, creatorUserId: GLOBAL_PREFERENCE } },
    select: { telegramEnabled: true },
  });
  return row?.telegramEnabled === true;
}

/**
 * Turn Telegram delivery on or off for every creator (acceptance 3). Writes a
 * consent event with the policy version. Off also clears per creator overrides,
 * so /stop means stop everywhere.
 */
export async function setGlobalTelegramDelivery(
  userId: number,
  telegramUserId: bigint,
  enabled: boolean,
  source: Extract<LinkEventSource, "settings" | "stop_command" | "mini_app">
) {
  const before = await getGlobalTelegramDelivery(userId);
  await prisma.notificationPreference.upsert({
    where: { userId_creatorUserId: { userId, creatorUserId: GLOBAL_PREFERENCE } },
    create: { userId, creatorUserId: GLOBAL_PREFERENCE, telegramEnabled: enabled },
    update: { telegramEnabled: enabled },
  });
  if (!enabled) {
    await prisma.notificationPreference.updateMany({
      where: { userId, creatorUserId: { not: GLOBAL_PREFERENCE } },
      data: { telegramEnabled: null },
    });
  }
  if (before !== enabled) {
    await recordLinkEvent(userId, telegramUserId, enabled ? "updates_on" : "updates_off", source);
  }
}

/** The link as its owner sees it. The Telegram id itself is never returned. */
export function ownLinkView(account: TelegramAccount) {
  return {
    username: decryptTelegramField(account.username),
    firstName: decryptTelegramField(account.firstName),
    botAccess: account.botAccess,
    blocked: account.blockedAt !== null,
    shareUsername: account.shareUsername,
    showTelegramOnBio: account.showTelegramOnBio,
  };
}

/**
 * The public page shows a Telegram mark (spec 3.2, 3.8): the creator linked
 * Telegram, kept the mark on, and the bot can reach them. Never the username.
 */
export async function showsTelegramMark(userId: number): Promise<boolean> {
  if (!env.TELEGRAM_ENABLED) return false;
  const account = await findByUserId(userId);
  return !!account && account.showTelegramOnBio && isReachable(account);
}

/**
 * Telegram answered 403 for a user: they blocked the bot. Stop writing to them until
 * they press Start again. Idempotent; records bot_blocked once.
 */
export async function markBotBlocked(userId: number) {
  const account = await findByUserId(userId);
  if (!account || account.blockedAt) return;
  await prisma.telegramAccount.update({
    where: { id: account.id },
    data: { blockedAt: new Date() },
  });
  await recordLinkEvent(userId, account.telegramUserId, "bot_blocked", "my_chat_member");
}
