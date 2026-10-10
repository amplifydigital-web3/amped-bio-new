/**
 * Messaging on Telegram (Build Board #2), shared by server, client and landing page.
 * Spec: docs/features/telegram-messaging.md, sections 3.9, 3.11a and 3.11b.
 *
 * Every string the product shows or the bot sends lives here and runs through
 * scripts/check-compliance-copy.ts (acceptance 18). Nothing in this file names a
 * reward, a yield, a return, a price, an amount next to tREVO, or claims that
 * Telegram verifies anyone. The bot may name Revolution Network and a creator pool.
 */

/** Community link in the footer and Help menu (predates the messaging feature). */
export const TELEGRAM_LINK = "https://t.me/the_revolution_network/1";
export const TELEGRAM_COLOR = "#229ED9";

// ----------------------------------------------------------------------------
// Limits (spec 3.9)
// ----------------------------------------------------------------------------

export const TELEGRAM_LIMITS = {
  /** Plain text message body, characters */
  messageBodyMax: 2000,
  /** Thread history returned per page */
  threadPageSize: 50,
  /** Fan sends per creator per hour */
  fanSendsPerCreatorPerHour: 20,
  /** Fan sends per day, all creators */
  fanSendsPerDay: 200,
  /** New threads per creator per day, default and ceiling */
  dailyNewThreadCapDefault: 50,
  dailyNewThreadCapMax: 500,
  /** Group removals per verification run */
  groupRemovalsPerRun: 50,
  /** Inline results per query */
  inlineResults: 10,
  /** Connected groups per creator */
  groupsPerCreator: 3,
  /** Bot send rate: global per second, per chat per second, per group per minute */
  sendPerSecond: 30,
  sendPerChatPerSecond: 1,
  sendPerGroupPerMinute: 20,
  /** Webhook update id dedupe window */
  updateDedupeHours: 24,
  /** Outbox and inbox claims older than this are resumed */
  jobStaleMs: 5 * 60 * 1000,
  /** Attempts before a job is marked FAILED */
  jobMaxAttempts: 5,
  /** Update log and inbox rows are purged after this many days */
  updateRetentionDays: 7,
} as const;

/** Telegram's published webhook source ranges, allowed at the edge (spec 3.14). */
export const TELEGRAM_WEBHOOK_SOURCE_RANGES = ["149.154.160.0/20", "91.108.4.0/22"] as const;

// ----------------------------------------------------------------------------
// Rules: who may message a creator or join a group (spec 3.3, Memberships decision 8)
// ----------------------------------------------------------------------------

/** Mirrors the Prisma DmRuleKind enum that arrives with the messaging PR. */
export const DM_RULE_KINDS = [
  "ANYONE",
  "FOLLOWER",
  "PAID_MEMBER",
  "POOL_MEMBER",
  "STAKE_MIN",
] as const;
export type DmRuleKind = (typeof DM_RULE_KINDS)[number];

/** Tile labels, Memberships decision 8: Members means paid, Pool fans means stakers. */
export const DM_RULE_LABELS: Record<DmRuleKind, string> = {
  ANYONE: "Anyone",
  FOLLOWER: "Followers and members",
  PAID_MEMBER: "Members only",
  POOL_MEMBER: "Pool fans only",
  STAKE_MIN: "Fans with a minimum stake",
};

/** Helper lines under each tile. The stake tile adds the amount well and the testnet line. */
export const DM_RULE_HELPERS: Record<DmRuleKind, string> = {
  ANYONE: "You can change this any time. New conversations are capped at 50 a day.",
  FOLLOWER: "Recommended. People who follow you, hold a membership or back your pool.",
  PAID_MEMBER: "People with a paid membership.",
  POOL_MEMBER: "People who back your pool.",
  STAKE_MIN: "Fans below the amount cannot write to you.",
};

/** Verbatim wherever tREVO appears. Exempt from the copy check by exact match. */
export const TESTNET_LINE =
  "Testnet only. tREVO has no cash value. Pool rewards are set by the creator, vary, and are not guaranteed.";

/** Badge beside a fan's handle in the thread list. */
export const FAN_RELATION_LABELS = {
  follower: "Follower",
  member: "Member",
  poolFan: "Pool fan",
} as const;

/** Block kinds the Mini App never renders (TON safe mode, spec decision 6). */
export const TELEGRAM_HIDDEN_BLOCK_KINDS = ["pool", "referral"] as const;

// ----------------------------------------------------------------------------
// In app strings (spec 3.11b). Keys name the surface.
// ----------------------------------------------------------------------------

export const TELEGRAM_APP_STRINGS = {
  homeCard: {
    body: "Your fans are on Telegram. Put your page there. Two minutes.",
    button: "Set up Telegram",
  },
  blockPickerTile: "Message me on Telegram. Fans write to you. You choose who gets through.",
  inboxEmpty: {
    body: "No messages yet. Add Message me on Telegram to your page and fans can reach you.",
    button: "Add the button",
  },
  composerReach: (n: number) => `${n} fans get this on Telegram too.`,
  composerReachZero:
    "Fans who link Telegram get your updates there. Share your Telegram page to grow this number.",
  composerNotLinked: "Link Telegram to send your updates there.",
  publicSignUpLine: (creator: string) => `Sign up to message ${creator} on Telegram.`,
  joinGroupHint: {
    PAID_MEMBER: (creator: string) => `Members only. Membership is on ${creator}'s page.`,
    POOL_MEMBER: (creator: string) => `Pool fans only. ${creator}'s pool is on their page.`,
    FOLLOWER: (creator: string) => `Follow ${creator} to get in.`,
  },
  exploreTooltip: "Messages on Telegram",
  accountNotLinked: {
    body: "Telegram. Message creators, get updates, join groups.",
    button: "Link",
  },
  accountMarkCheckbox: {
    label: "Show a Telegram mark on my page",
    helper:
      "Visitors see that you take messages on Telegram. Your Telegram username is never shown.",
  },
  accountUpdatesCheckbox: {
    label: "Get creator updates on Telegram",
    helper: "Updates from creators you follow arrive in Telegram as well as your inbox.",
  },
  accountShareUsernameCheckbox: {
    label: "Let creators see my Telegram username",
    helper:
      "Creators you message see your Amped.Bio handle. Turn this on to show your Telegram username too.",
  },
  publicMarkTooltip: "Messages on Telegram",
  miniAppHeader: (creator: string) => `${creator} on Amped.Bio`,
  miniAppNotLinked: "Link Telegram to Amped.Bio to continue.",
  wizardDoneToast: "Telegram is on. Your page link is copied.",
  errors: {
    popupBlocked: "Your browser blocked the Telegram window. Open it in a new tab.",
    alreadyLinked:
      "This Telegram account is linked to another Amped account. Unlink it there first.",
    declined: "Telegram did not confirm the link. Try again.",
    notPublished: "Publish your page before turning on messages.",
    emailNotVerified: "Verify your email first.",
    notLinked: "Link Telegram first.",
    groupNotAdmin: "The bot is not an admin yet. Add it and try again.",
  },
  unlinkUndo: "Telegram unlinked.",
} as const;

// ----------------------------------------------------------------------------
// Bot strings (spec 3.11b and the bot copy pack). Counsel reads this block.
// ----------------------------------------------------------------------------

export const TELEGRAM_BOT_PROFILE = {
  name: "Amped.Bio",
  /** 120 characters max */
  about:
    "Message creators, get their updates and join their groups. Linked to your Amped.Bio account.",
  /** 512 characters max */
  description:
    "Amped.Bio connects your Telegram to creators' pages. Link your account once. Then message creators who have opened the door to you, get their updates here, and join their private groups when you qualify. Creators choose who can reach them. We store your Telegram id and name, never your phone number or your chats. Unlink any time from Account, Connected apps on Amped.Bio.",
  inlinePlaceholder: "Type a creator's handle",
  stagingAboutPrefix: "Staging. Test accounts only. ",
} as const;

export const TELEGRAM_BOT_COMMANDS = [
  { command: "start", description: "Link Telegram or pick a creator to message" },
  { command: "creators", description: "Creators you can message" },
  { command: "stop", description: "Pause creator updates on Telegram" },
  { command: "help", description: "How this bot works" },
  { command: "privacy", description: "What we store and how to unlink" },
] as const;

export const TELEGRAM_BOT_BUTTONS = {
  linkTelegram: "Link Telegram",
  openAmped: "Open Amped.Bio",
  openInbox: "Open Inbox",
  openThread: "Open thread on Amped.Bio",
  openAccount: "Open Account",
  privacyNotice: "Privacy notice",
  seeMembership: "See membership",
  messageCreator: (creator: string) => `Message ${creator}`,
  openCreator: (creator: string) => `Open ${creator} on Amped.Bio`,
  openCreatorPage: (creator: string) => `Open ${creator}'s page`,
  openOnAmped: "Open on Amped.Bio",
  openPage: "Open page",
  message: "Message",
  joinGroup: "Join group",
} as const;

export const TELEGRAM_BOT_STRINGS = {
  startLinkedFirst: (handle: string) =>
    `Hi ${handle}. You are linked to Amped.Bio. Message a creator from their page, or pick one below.`,
  startLinkedReturning: (handle: string) =>
    `Welcome back, ${handle}. Pick a creator or open your page on Amped.Bio.`,
  startNotLinked:
    "This bot connects your Telegram to Amped.Bio. Link your account to message creators and get their updates.",
  dmReady: (creator: string) => `You are writing to ${creator}. Send your message.`,
  dmRefused: {
    FOLLOWER: (creator: string) =>
      `${creator} takes messages from followers and members. Follow them on Amped.Bio to write.`,
    PAID_MEMBER: (creator: string) =>
      `${creator} takes messages from members. Membership is on their page.`,
    POOL_MEMBER: (creator: string) =>
      `${creator} takes messages from pool fans. Their pool is on their page.`,
    STAKE_MIN: (creator: string) =>
      `${creator} takes messages from fans above a minimum stake. The details are on their page.`,
  },
  dmPausedOrBlocked: (creator: string) => `${creator} is not taking messages from you right now.`,
  dmCapReached: (creator: string) =>
    `${creator} has reached today's limit for new conversations. Try again tomorrow.`,
  creatorReplied: (creator: string, text: string) => `${creator} replied: ${text}`,
  pickCreator: "Pick who this is for.",
  creatorNotAReply:
    "To answer a fan, reply to their message above. To write to everyone who follows you, use Broadcast on Amped.Bio.",
  creatorReplyFailedBlocked: (handle: string) =>
    `Your reply did not reach ${handle}. They have blocked the bot. Your message is saved in Inbox.`,
  blockedByCreator: (creator: string) => `${creator} has closed messages from you.`,
  textOnly: "Text only for now.",
  creatorsList: "You can message these creators.",
  creatorsNone: "You are not following anyone yet. Find creators on Amped.Bio.",
  stop: "Creator updates on Telegram are paused. You still get them in your Amped.Bio inbox. Send /start to turn them back on.",
  help: "Link Telegram to your Amped.Bio account once. Then tap Message me on Telegram on any creator's page to write to them here. Creators choose who can reach them. Updates from creators you follow arrive here when you turn them on. Send /stop to pause them and /privacy to see what we store.",
  privacy:
    "We store your Telegram id, name and photo link, and the messages you exchange with creators through this bot, for 12 months after the last message. We never store your phone number, your contacts or your other chats. Creators see your Amped.Bio handle, not your Telegram username, unless you turn that on. Unlink at Account, Connected apps on Amped.Bio.",
  broadcastFooter: "Sent through Amped.Bio. Manage updates at Account, Connected apps.",
  groupApproved: (creator: string) => `You are in. Welcome to ${creator}'s group.`,
  groupDeclined: {
    PAID_MEMBER: (creator: string) => `${creator}'s group is for members. Here is how to join.`,
    POOL_MEMBER: (creator: string) =>
      `${creator}'s group is for pool fans. Their pool is on their page.`,
    FOLLOWER: (creator: string) => `Follow ${creator} on Amped.Bio to get in.`,
    STAKE_MIN: (creator: string) =>
      `${creator}'s group is for fans above a minimum stake. The details are on their page.`,
  },
  groupNotLinked: (creator: string) => `Link Telegram on Amped.Bio to join ${creator}'s group.`,
  groupRemoved: (creator: string) =>
    `You no longer meet the rule for ${creator}'s group, so you were removed. You can rejoin once you qualify.`,
  botAddedNoAdmin:
    "Thanks for adding Amped.Bio. Make me an admin with Invite users and Ban users, then connect this group from My Pool on Amped.Bio. I never post in your group.",
  inlineCardLine: (followers: number) =>
    `${followers} followers on Amped.Bio. Messages on Telegram.`,
  unlinked:
    "Your Telegram is unlinked from Amped.Bio. This bot will not message you again unless you link it again.",
} as const;

/** Phrases the compliance check rejects on Telegram surfaces, beyond BROADCAST_BANNED_TERMS. */
export const TELEGRAM_BANNED_PHRASES = [
  "verified by telegram",
  "message all your fans",
  "trevo reward",
  "revo price",
] as const;

/** Strings the compliance check skips by exact match (they quote the policy, not promote). */
export const TELEGRAM_COPY_EXEMPT = [TESTNET_LINE] as const;

/** Walks a constants object and returns every string it produces, calling template functions with sample values. */
export function collectTelegramCopy(root: unknown = TELEGRAM_COPY_ROOTS): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (typeof value === "function") {
      const fn = value as (...args: unknown[]) => unknown;
      const produced = fn("Maya Lin", "sample");
      if (typeof produced === "string") out.push(produced);
      const numeric = fn(128, "sample");
      if (typeof numeric === "string" && numeric !== produced) out.push(numeric);
      return;
    }
    if (value && typeof value === "object") {
      if (seen.has(value)) return;
      seen.add(value);
      for (const child of Object.values(value as Record<string, unknown>)) visit(child);
    }
  };
  visit(root);
  return out;
}

export const TELEGRAM_COPY_ROOTS = {
  DM_RULE_LABELS,
  DM_RULE_HELPERS,
  FAN_RELATION_LABELS,
  TELEGRAM_APP_STRINGS,
  TELEGRAM_BOT_PROFILE,
  TELEGRAM_BOT_COMMANDS,
  TELEGRAM_BOT_BUTTONS,
  TELEGRAM_BOT_STRINGS,
} as const;
