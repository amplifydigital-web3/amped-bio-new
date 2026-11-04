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

/**
 * Inbox, bell and settings copy (PR M5, spec section 9, boards m1 to m8). Plain words,
 * no dashes, no amounts beside tREVO. Template strings take the handle without the @.
 */
export const MESSAGE_UI = {
  rail: "Inbox",
  tabs: { primary: "Primary", requests: "Requests", broadcast: "Broadcast" },
  filters: {
    all: "All",
    unread: "Unread",
    poolFans: "Pool fans",
    followers: "Followers",
  },
  relation: {
    member: "Member",
    poolFan: "Pool fan",
    follower: "Follows you",
    youFollow: "You follow",
  },
  newMessage: "New message",
  newMessageTitle: "New message",
  toLabel: "To",
  toPlaceholder: "Name or @handle",
  toHelp: "Search your conversations, or type a handle and press Enter.",
  toNotFound: "No account with that handle.",
  searchLabel: "Search messages",
  searchPlaceholder: "Search people and messages",
  searchNoResults: (q: string) => `Nothing matches "${q}".`,
  emptyPrimaryTitle: "No messages yet",
  emptyPrimary: "Message a creator from their page, or start one here.",
  emptyRequestsTitle: "No requests",
  emptyRequests: "Messages from people you don't follow show up here.",
  emptyArchivedTitle: "Nothing archived",
  emptyArchived: "Archived conversations move back when a new message arrives.",
  emptyFilterTitle: "No conversations here",
  emptyFilter: "Try another filter.",
  pickConversation: "Choose a conversation to read it.",
  listError: "Your messages did not load",
  listErrorCause: "Check your connection and try again.",
  threadError: "This conversation did not load",
  showArchived: "Archived",
  backToInbox: "Back to Inbox",
  showOlder: "Show older messages",
  today: "Today",
  yesterday: "Yesterday",
  you: "You",
  seen: (time: string) => `Seen ${time}`,
  sent: "Sent",
  sending: "Sending",
  failed: "Not sent.",
  retry: "Retry",
  removed: "Message removed",
  muted: "Muted",
  typing: (name: string) => `${name} is typing`,
  composerLabel: (handle: string) => `Message @${handle}`,
  composerPlaceholder: "Write a message",
  send: "Send",
  charsLeft: (n: number) => `${n} left`,
  offline: "You are offline. Messages send when you reconnect.",
  readOnly: "Sending is paused on Amped.Bio right now. You can still read your messages.",
  financialWarning:
    "This reads like a financial promise. The Amped.Bio rules do not allow them, and Amped can see flagged messages.",
  requestNotice: (handle: string) =>
    `@${handle} is not someone you follow. Links are off until you accept.`,
  accept: "Accept",
  delete: "Delete",
  deleteRequestTitle: "Delete this request?",
  deleteRequestBody: (handle: string) =>
    `The conversation leaves your Requests. @${handle} is not told. A new message brings it back.`,
  goesToRequests: (handle: string) =>
    `@${handle} does not follow you, so this goes to their Requests. You can send up to 3 messages until they accept.`,
  waitingAccept: (handle: string) =>
    `Your request is waiting. You can send up to 3 messages until @${handle} accepts.`,
  blockedYou: "You blocked this account. Unblock to send messages.",
  deletedAccount: "This account was deleted.",
  menu: {
    label: "Conversation actions",
    viewPage: "View page",
    mute8: "Mute for 8 hours",
    mute7: "Mute for 7 days",
    muteAlways: "Mute until I turn it back on",
    unmute: "Unmute",
    archive: "Archive",
    unarchive: "Move to Inbox",
    block: "Block",
    unblock: "Unblock",
    report: "Report",
    clear: "Delete for me",
    unsend: "Unsend",
    copy: "Copy text",
  },
  clearTitle: "Delete this conversation for you?",
  clearBody: "Messages so far disappear from your Inbox only. The other person keeps their copy.",
  blockTitle: (handle: string) => `Block @${handle}?`,
  blockBody:
    "Neither of you can send messages while the block is on. They are not told. You can unblock any time in Account, Messages.",
  unsendTitle: "Unsend this message?",
  unsendBody: "It is removed for both of you. A copy stays with Amped only if someone reported it.",
  reportTitle: "Report this conversation",
  reportBody: "Amped reviews every report. The other person does not see who reported.",
  reportNote: "Anything else (optional)",
  reportAlsoBlock: "Also block this account",
  reportSend: "Send report",
  reportSent: "Thanks. Amped will review this.",
  cancel: "Cancel",
  saveFailed: "That did not save. Try again.",
  copied: "Copied",
  toast: {
    reply: "Reply",
    from: (name: string) => `${name}`,
  },
  bell: {
    label: (n: number) => (n > 0 ? `Notifications, ${n} new` : "Notifications"),
    title: "Notifications",
    markAll: "Mark all as seen",
    viewAll: "Open Inbox",
    empty: "Nothing new",
    emptyBody: "Messages and broadcasts show up here.",
    message: (handle: string, count: number) =>
      count > 1 ? `@${handle} sent you ${count} messages` : `@${handle} sent you a message`,
    request: (handle: string) => `@${handle} wants to message you`,
    broadcast: (handle: string) => `@${handle} sent a broadcast`,
    someone: "someone",
    error: "Notifications did not load",
  },
  push: {
    ask: "Get a notice when someone messages you?",
    askBody: "Your browser asks next. You can turn it off any time in Account, Messages.",
    turnOn: "Turn on",
    notNow: "Not now",
    blocked:
      "Notifications are blocked for Amped.Bio in this browser. Allow them in the browser settings, then try again.",
    unsupported: "This browser cannot show notifications.",
    iosHint: "To get alerts on iPhone, add Amped.Bio to your Home Screen, then open it from there.",
    on: "On for this device",
    off: "Off for this device",
  },
  settings: {
    row: "Messages",
    whoTitle: "Who can message me",
    whoHelp:
      "People you follow, and people you already talk to, can always reach you. Others land in Requests.",
    recommended: "Recommended",
    followerHelp: "People who follow you, and your members",
    paidSoon: "Memberships are coming soon.",
    needsPool: "Create your pool to use this rule.",
    stakeLabel: "Minimum stake",
    stakeUnit: "tREVO",
    stakeError: "Enter a whole number of tREVO above zero.",
    requestsTitle: "Requests",
    requestsBody:
      "A request shows up to 3 messages with links off. Accept to move it to Primary, or delete it. The sender is not told.",
    receipts: "Read receipts",
    receiptsHelp:
      "People see when you read their messages. You see theirs only while yours are on.",
    notifications: "Notifications",
    pushLabel: "Push on this device",
    pushHelp: "A notice when a message arrives and Amped.Bio is closed.",
    emailLabel: "Email reminders",
    emailHelp: "An email when a message waits unread for 30 minutes. At most 3 a day.",
    blockedTitle: "Blocked accounts",
    blockedEmpty: "You have not blocked anyone.",
    unblock: "Unblock",
    saved: "Saved",
    save: "Save",
    loadError: "Message settings did not load",
  },
  refusalFollow: "Follow",
} as const;

/** Every Amped Messages string, for `pnpm run check:copy` (spec acceptance 13). */
export function collectMessageCopy(): string[] {
  return [
    ...Object.values(MESSAGE_RULE_LABELS),
    ...Object.values(MESSAGE_RULE_HELPERS),
    ...Object.values(MESSAGE_REFUSALS).map(copy => copy("maya.lin")),
    ...MESSAGE_REPORT_REASONS.map(r => r.label),
    MESSAGE_REMOVED_LABEL,
    DELETED_ACCOUNT_LABEL,
    ...collectStrings(MESSAGE_UI),
  ];
}

/** Every string in a nested copy object; functions are called with sample values. */
function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const sample = (value as (...args: unknown[]) => unknown)("maya.lin", 2);
    return typeof sample === "string" ? [sample] : [];
  }
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}
