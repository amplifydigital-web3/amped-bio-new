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
