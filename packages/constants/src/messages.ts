/**
 * Amped Messages (Build Board #2, revision 4), shared by server and clients.
 * Spec: docs/features/messaging.md sections 5 and 7. Replaces TELEGRAM_LIMITS for
 * messaging; the Telegram constants stay until PR M8 removes Telegram.
 *
 * Caps are defaults. Admins change them under SiteSettings keys messaging.caps.*
 * (spec 7.6); the server reads the setting first and falls back to these values.
 */

export const MESSAGE_LIMITS = {
  /** Plain text message body, characters */
  bodyMax: 2000,
  /** The composer shows a character count from here */
  bodyCountFrom: 1800,
  /** Messages returned per page */
  pageSize: 50,
  /** Sender caps (msg-new-accounts) */
  sendsPerConversationPerHour: 20,
  sendsPerDay: 200,
  newConversationsPerDay: 50,
  /** Accounts younger than newAccountDays may start this many conversations a day */
  newAccountDays: 7,
  newAccountConversationsPerDay: 5,
  /** Messages a sender may send before the recipient accepts a request (msg-requests) */
  messagesBeforeAccept: 3,
  /** Recipient side default and ceiling for new conversations a day */
  dailyNewThreadCapDefault: 50,
  dailyNewThreadCapMax: 500,
  /** Unsend for everyone window, minutes (msg-delete) */
  unsendWindowMinutes: 15,
  /** Typing shows for this long and may be sent at most once per typingEverySeconds */
  typingSeconds: 6,
  typingEverySeconds: 3,
  /** Email reminder for an unread message (msg-push) */
  emailReminderAfterMinutes: 30,
  emailReminderPerConversationHours: 6,
  emailRemindersPerDay: 3,
  /** Bell popover length */
  bellItems: 20,
  /** Rail badge caps here, then shows 99+ */
  badgeMax: 99,
} as const;

/** SiteSettings keys an admin can change (spec 7.6). Values are integers. */
export const MESSAGE_CAP_SETTING_KEYS = {
  sendsPerConversationPerHour: "messaging.caps.sendsPerConversationPerHour",
  sendsPerDay: "messaging.caps.sendsPerDay",
  newConversationsPerDay: "messaging.caps.newConversationsPerDay",
  newAccountConversationsPerDay: "messaging.caps.newAccountConversationsPerDay",
  messagesBeforeAccept: "messaging.caps.messagesBeforeAccept",
} as const;

export type MessageCapKey = keyof typeof MESSAGE_CAP_SETTING_KEYS;

/** Shown in place of the body of an unsent message or one from a deleted account */
export const MESSAGE_REMOVED_LABEL = "Message removed";
/** Shown in place of the name of a deleted account */
export const DELETED_ACCOUNT_LABEL = "Deleted account";

/**
 * Who can message me (msg-rules). Mirrors the Prisma DmRuleKind enum, which gained
 * NOBODY in PR M2. Telegram groups keep DM_RULE_KINDS (without NOBODY) until M8.
 */
export const MESSAGE_RULE_KINDS = [
  "ANYONE",
  "FOLLOWER",
  "PAID_MEMBER",
  "POOL_MEMBER",
  "STAKE_MIN",
  "NOBODY",
] as const;
export type MessageRuleKind = (typeof MESSAGE_RULE_KINDS)[number];

/** Tile labels (board m5). Members means paid, Pool fans means stakers. */
export const MESSAGE_RULE_LABELS: Record<MessageRuleKind, string> = {
  ANYONE: "Anyone",
  FOLLOWER: "Followers and members",
  PAID_MEMBER: "Members only",
  POOL_MEMBER: "Pool fans only",
  STAKE_MIN: "Fans with a minimum stake",
  NOBODY: "No one",
};

/** Helper lines under each tile. */
export const MESSAGE_RULE_HELPERS: Record<MessageRuleKind, string> = {
  ANYONE: "Every Amped.Bio account",
  FOLLOWER: "Recommended",
  PAID_MEMBER: "People with a paid membership",
  POOL_MEMBER: "People staked in your pool",
  STAKE_MIN: "You set the tREVO amount",
  NOBODY: "Only existing conversations",
};

export const MESSAGE_REFUSAL_REASONS = [
  "disabled",
  "closed",
  "blocked",
  "not_follower",
  "not_member",
  "not_pool_fan",
  "stake_below",
  "cap_reached",
  "sender_cap",
  "sender_paused",
  "awaiting_accept",
] as const;
export type MessageRefusalReason = (typeof MESSAGE_REFUSAL_REASONS)[number];

/** Refusal copy (spec 9). Names the rule and the next step, never an amount. */
export const MESSAGE_REFUSALS: Record<MessageRefusalReason, (handle: string) => string> = {
  disabled: () => "Sending is paused on Amped.Bio right now. You can still read your messages.",
  closed: h => `@${h} is not taking messages.`,
  blocked: h => `@${h} is not taking messages.`,
  not_follower: h => `@${h} takes messages from followers and members. Follow to message them.`,
  not_member: h => `@${h} takes messages from members only.`,
  not_pool_fan: h => `@${h} takes messages from pool fans only.`,
  stake_below: h => `@${h} takes messages from fans with a minimum stake.`,
  cap_reached: h => `@${h} has reached today's limit for new conversations. Try again tomorrow.`,
  sender_cap: () => "You have reached today's message limit. Try again tomorrow.",
  sender_paused: () => "You can't send messages right now.",
  awaiting_accept: h => `Wait for @${h} to accept your request before sending more.`,
};

/** Report reasons (board m8). Values match the Prisma MessageReportReason enum. */
export const MESSAGE_REPORT_REASONS = [
  { value: "SPAM", label: "Spam" },
  { value: "HARASSMENT", label: "Harassment" },
  { value: "FINANCIAL_PROMISE", label: "Financial promise" },
  { value: "OTHER", label: "Something else" },
] as const;

/** Every Amped Messages string, for `pnpm run check:copy` (spec acceptance 13). */
export function collectMessageCopy(): string[] {
  return [
    ...Object.values(MESSAGE_RULE_LABELS),
    ...Object.values(MESSAGE_RULE_HELPERS),
    ...Object.values(MESSAGE_REFUSALS).map(copy => copy("maya.lin")),
    ...MESSAGE_REPORT_REASONS.map(r => r.label),
    MESSAGE_REMOVED_LABEL,
    DELETED_ACCOUNT_LABEL,
  ];
}
