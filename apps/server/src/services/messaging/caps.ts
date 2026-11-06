import { prisma } from "@repo/database";
import { MESSAGE_CAP_SETTING_KEYS, MESSAGE_LIMITS, type MessageCapKey } from "@repo/constants";
import { isFeatureOn } from "../featureFlags";

/**
 * Amped Messages caps (spec 7.6, decision msg-new-accounts). Admins change them under
 * SiteSettings keys messaging.caps.* (the admin page arrives in PR M7); a missing or
 * invalid value falls back to MESSAGE_LIMITS. Read at most once a minute per instance.
 */

export type MessageCaps = Record<MessageCapKey, number>;

const TTL_MS = 60_000;
let cached: { at: number; caps: MessageCaps } | null = null;

function defaults(): MessageCaps {
  return {
    sendsPerConversationPerHour: MESSAGE_LIMITS.sendsPerConversationPerHour,
    sendsPerDay: MESSAGE_LIMITS.sendsPerDay,
    newConversationsPerDay: MESSAGE_LIMITS.newConversationsPerDay,
    newAccountConversationsPerDay: MESSAGE_LIMITS.newAccountConversationsPerDay,
    messagesBeforeAccept: MESSAGE_LIMITS.messagesBeforeAccept,
  };
}

export async function messageCaps(now = Date.now()): Promise<MessageCaps> {
  if (cached && now - cached.at < TTL_MS) return cached.caps;
  const caps = defaults();
  const keys = Object.values(MESSAGE_CAP_SETTING_KEYS);
  const rows = await prisma.siteSettings.findMany({
    where: { setting_key: { in: keys } },
    select: { setting_key: true, setting_value: true },
  });
  for (const [name, key] of Object.entries(MESSAGE_CAP_SETTING_KEYS) as [MessageCapKey, string][]) {
    const row = rows.find(r => r.setting_key === key);
    const value = row ? Number(row.setting_value) : NaN;
    if (Number.isInteger(value) && value >= 0 && value <= 100_000) caps[name] = value;
  }
  cached = { at: now, caps };
  return caps;
}

/** For tests and for the admin save in M7. */
export function clearMessageCapsCache() {
  cached = null;
}

/**
 * The kill switch: the `messages` feature flag (admin Feature flags, falling back to
 * MESSAGING_ENABLED), and SiteSettings messaging.enabled ("false") so an admin can stop
 * sending without a deploy (M7 writes it).
 */
export async function messagingEnabled(): Promise<boolean> {
  if (!isFeatureOn("messages")) return false;
  const row = await prisma.siteSettings.findUnique({
    where: { setting_key: "messaging.enabled" },
    select: { setting_value: true },
  });
  return row?.setting_value !== "false";
}
