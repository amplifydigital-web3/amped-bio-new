/**
 * Messaging on Telegram (Build Board #2), shared by server, client and landing page.
 * Spec: docs/features/telegram-messaging.md, sections 3.9, 3.11a and 3.11b.
 *
 * Every string the product shows or the bot sends lives here and runs through
 * scripts/check-compliance-copy.ts (acceptance 18). Nothing in this file names a
 * reward, a yield, a return, a price, an amount next to tREVO, or claims that
 * Telegram verifies anyone. The bot may name Revolution Network and a creator pool.
 */

import { TESTNET_NOTICE } from "./testnet";
import type { BlockType } from "./blocks";

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

/**
 * Verbatim wherever tREVO appears. Exempt from the copy check by exact match. Since
 * Full QA (29 Oct, F5) this is the platform line, TESTNET_NOTICE, not a Telegram copy.
 * @deprecated import TESTNET_NOTICE
 */
export const TESTNET_LINE = TESTNET_NOTICE;

/** Badge beside a fan's handle in the thread list. */
export const FAN_RELATION_LABELS = {
  follower: "Follower",
  member: "Member",
  poolFan: "Pool fan",
} as const;

// ----------------------------------------------------------------------------
// Mini App allow list (spec r3 3.7, decisions tg-miniapp-allowlist, tg-miniapp-gated-join,
// tg-miniapp-adult). Telegram binds Mini Apps with crypto to TON, and digital goods
// sold inside Telegram to Stars. The Mini App renders only the kinds below; every
// other kind, and every kind added later, is skipped until it is added here.
// ----------------------------------------------------------------------------

/** Link and media platforms that carry crypto. Never rendered inside the Mini App. */
export const CRYPTO_PLATFORMS = [
  "token-price",
  "nft-collection",
  "uniswap",
  "opensea",
  "creator-pool",
] as const;

/** Block types the Mini App may render. Link and media also pass the platform check. */
export const TELEGRAM_MINIAPP_BLOCK_KINDS = [
  "text",
  "link",
  "media",
  "follow",
  "followers",
  "telegram_message",
  "telegram_group",
] as const;

/** Group rules whose Join button may show in the Mini App to any viewer. */
export const TELEGRAM_MINIAPP_OPEN_GROUP_RULES = ["ANYONE", "FOLLOWER"] as const;

type MiniAppBlockLike = Pick<BlockType, "type" | "config"> & { adult?: boolean | null };

/**
 * True when the Mini App may render this block. 18+ blocks never render. Group
 * blocks pass here; the renderer still hides Join group unless the group's rule is
 * in TELEGRAM_MINIAPP_OPEN_GROUP_RULES or the viewer already qualifies.
 */
export function isMiniAppSafeBlock(block: MiniAppBlockLike): boolean {
  if (block.adult) return false;
  if (!(TELEGRAM_MINIAPP_BLOCK_KINDS as readonly string[]).includes(block.type)) return false;
  if (block.type === "link" || block.type === "media") {
    const platform = (block.config as { platform?: string } | null)?.platform ?? "";
    return !(CRYPTO_PLATFORMS as readonly string[]).includes(platform);
  }
  return true;
}

// ----------------------------------------------------------------------------
// Deep link payloads (spec r3 3.5, decision tg-deeplink-payload, Full QA F6).
// Telegram allows 64 characters from A-Z a-z 0-9 _ -. Handles can be 64 characters,
// so payloads carry a creator's short link code instead. dm_{handle} stays readable
// for buttons already on published pages.
// ----------------------------------------------------------------------------

export const TELEGRAM_LINK_CODE_LENGTH = 10;
export const TELEGRAM_LINK_CODE_REGEX = /^[a-z0-9]{10}$/;

export const telegramPayload = {
  /** Message me on Telegram: the bot opens with the creator selected */
  message: (code: string) => `m_${code}`,
  /** Join group: the bot checks the rule and sends the invite */
  join: (code: string) => `j_${code}`,
  /** Mini App page, with the sharer's own link code for attribution */
  page: (code: string, sharerCode?: string | null) =>
    sharerCode ? `p_${code}_${sharerCode}` : `p_${code}`,
} as const;

export type TelegramStartPayload =
  | { kind: "message"; code: string }
  | { kind: "join"; code: string }
  | { kind: "page"; code: string; sharerCode: string | null }
  | { kind: "legacy_dm"; handle: string }
  | { kind: "none" };

/** Reads a /start or startapp payload. Anything unknown reads as none. */
export function parseTelegramStartPayload(raw: string | null | undefined): TelegramStartPayload {
  const payload = (raw ?? "").trim();
  if (!payload || payload.length > 64) return { kind: "none" };
  const code = (value: string | undefined) =>
    value && TELEGRAM_LINK_CODE_REGEX.test(value) ? value : null;
  if (payload.startsWith("m_")) {
    const c = code(payload.slice(2));
    return c ? { kind: "message", code: c } : { kind: "none" };
  }
  if (payload.startsWith("j_")) {
    const c = code(payload.slice(2));
    return c ? { kind: "join", code: c } : { kind: "none" };
  }
  if (payload.startsWith("p_")) {
    const [first, second, ...rest] = payload.slice(2).split("_");
    const c = code(first);
    if (!c || rest.length > 0) return { kind: "none" };
    return { kind: "page", code: c, sharerCode: code(second) };
  }
  if (payload.startsWith("dm_")) {
    // Older handles may carry capitals; the bot's handle lookup also tries lowercase
    const handle = payload.slice(3);
    return /^[A-Za-z0-9_-]{1,61}$/.test(handle) ? { kind: "legacy_dm", handle } : { kind: "none" };
  }
  return { kind: "none" };
}

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
  // PR 2: Account, Connected apps (row 112) and the Broadcast composer (row 117)
  accountRowTitle: "Telegram",
  accountLinkedAs: (username: string) => `Linked as @${username}.`,
  accountLinkedNoUsername: "Linked. Your Telegram account has no username.",
  accountBlockedNotice:
    "You blocked the Amped.Bio bot in Telegram, so nothing reaches you there. Unblock it in Telegram and send /start.",
  botStartNotice:
    "One more step: open the Amped.Bio bot in Telegram and press Start. Until you do, the bot cannot send you anything.",
  openBotButton: "Open the bot",
  linkButton: "Link Telegram",
  unlinkButton: "Unlink",
  unlinkConfirmTitle: "Unlink Telegram?",
  unlinkConfirmBody:
    "Updates stop reaching your Telegram at once. Your Amped.Bio inbox keeps everything. You can link again any time.",
  linkedToast: "Telegram linked.",
  composerChannelLabel: "Telegram",
  composerChannelHelper: "Members who linked Telegram and turned on updates get this there too.",
  composerFlaggedNote:
    "Broadcasts with words from the word list go to the Amped.Bio inbox only, not to Telegram.",
  // PR 3: why a web send was refused. Keys are the canMessage reasons.
  messagingRefusals: {
    disabled: (creator: string) => `${creator} is not taking messages right now.`,
    blocked: (creator: string) => `${creator} is not taking messages from you right now.`,
    not_follower: (creator: string) =>
      `${creator} takes messages from followers and members. Follow them to write.`,
    not_member: (creator: string) =>
      `${creator} takes messages from members. Membership is on their page.`,
    not_pool_fan: (creator: string) =>
      `${creator} takes messages from pool fans. Their pool is on their page.`,
    stake_below: (creator: string) =>
      `${creator} takes messages from fans above a minimum stake. The details are on their page.`,
    cap_reached: (creator: string) =>
      `${creator} has reached today's limit for new conversations. Try again tomorrow.`,
    sender_cap: "You have reached the message limit for now. Try again later.",
    sender_paused: "Sending is paused on your account for now. Try again tomorrow.",
  },
  messagingSettingsErrors: {
    notPublished: "Publish your page before turning on messages.",
    emailNotVerified: "Verify your email first.",
    notLinked: "Link Telegram first.",
    botNotStarted: "Open the Amped.Bio bot in Telegram and press Start, then try again.",
    notInvited: "Fan messages are invite only for now.",
    paused: "Fan messages are paused on your account while Amped reviews reports.",
    needsPool: "Create your pool first. Then you can limit messages to pool fans.",
    stakeMin: "Enter a whole number of tREVO above zero.",
    paidMembers: "Memberships are not available yet.",
  },
  // PR 4: Inbox tabs, Messages (row 113, tg2) and Settings, Fan messages (row 114, tg3)
  inboxTabs: { updates: "Updates", messages: "Messages", settings: "Settings" },
  messagesFilters: { all: "All", unread: "Unread", blocked: "Blocked", sent: "To creators" },
  messagesFilterEmpty: "No conversations match this filter.",
  messagesEmptyTitle: "No messages yet",
  filterEmptyTitle: "Nothing here",
  youPrefix: "You: ",
  fanThreadsEmpty:
    "You have not written to a creator yet. Tap Message me on Telegram on a creator's page.",
  chooseThread: "Choose a conversation to read it.",
  threadLoadError: "This conversation did not load.",
  listLoadError: "Your messages did not load.",
  replyLabel: "Reply",
  replyPlaceholder: "Write a reply",
  writePlaceholder: "Write a message",
  send: "Send",
  sending: "Sending",
  sendFailed: "Not sent. Check your connection and try again.",
  showOlder: "Show older",
  sentFromTelegram: "Sent from Telegram",
  notReachable: "Not delivered to Telegram. Saved here.",
  threadClosedCreator: "You blocked this conversation. Unblock it to reply.",
  threadClosedByFan: "This fan closed the conversation. You can reply when they write again.",
  threadClosedFan: (creator: string) => `${creator} is not taking messages from you right now.`,
  threadClosedFanSelf: "You blocked this conversation. Unblock it to write again.",
  mute7: "Mute for 7 days",
  mute30: "Mute for 30 days",
  unmute: "Unmute",
  mutedLine: "Muted. Messages still arrive here. Telegram copies pause.",
  block: "Block",
  unblock: "Unblock",
  report: "Report",
  blockConfirmTitle: (fan: string) => `Block ${fan}?`,
  blockConfirmBody:
    "They can no longer message you. The bot tells them once. You can unblock them later.",
  blockFanConfirmTitle: (creator: string) => `Block ${creator}?`,
  blockFanConfirmBody: "They can no longer reply to you. You can unblock them later.",
  reportTitle: "Report this conversation",
  reportBody:
    "Amped reads a conversation only after a report. The other person does not see who reported.",
  reportSent: "Thanks. Amped will review this conversation.",
  reportFailed: "Your report was not sent. Try again.",
  actionFailed: "That did not work. Try again.",
  moreActions: "More actions",
  backToMessages: "Messages",
  settingsTitle: "Fan messages",
  settingsIntro:
    "Fans write to you through the Amped.Bio bot on Telegram. You read and reply here or in Telegram. Your Telegram username is never shown.",
  settingsEnable: {
    label: "Take messages from fans",
    helper: "Turn this off any time. Conversations you already have stay in your inbox.",
  },
  ruleTitle: "Who can message you",
  recommended: "Recommended",
  paidMembersSoon: "Shown once Memberships opens.",
  needsPoolHint: "Create your pool to use this.",
  stakeMinLabel: "Minimum stake",
  stakeMinUnit: "tREVO",
  capLabel: "New conversations a day",
  capHelper: "1 to 500. Fans you already talk with can keep writing.",
  capError: "Enter a whole number from 1 to 500.",
  replyFromTelegram: {
    label: "Reply from Telegram",
    helper: "Fan messages arrive in your chat with the Amped.Bio bot. Reply to one to answer it.",
  },
  settingsSaved: "Saved.",
  settingsFailed: "Not saved. Check your connection and try again.",
  requirementsTitle: "Before you turn on Fan messages",
  requirementLink: "Link Telegram in Account, Connected apps.",
  requirementStartBot: "Press Start in the Amped.Bio bot on Telegram.",
  requirementEmail: "Verify your email.",
  requirementPublish: "Publish your page.",
  openAccount: "Open Account",
  // PR 4: the Message me on Telegram block (row 115, tg4)
  messageBlockTitle: "Message me on Telegram",
  groupBlockTitle: "Join my Telegram group",
  blockLabelHelper: "Fans tap it and Telegram opens with you selected.",
  blockLabelRequired: "Add a label, for example Message me on Telegram",
  copyFailed: "Could not copy the link",
  blockOffNotice: "Turn on Fan messages first. Visitors do not see this button until you do.",
  blockOffButton: "Open Fan messages",
  groupBlockSoon: "Telegram groups open later. Visitors do not see this block yet.",
  publicOpenTelegram: "Telegram opens in a new tab.",
  // PR 4: wizard A, creator setup (row 121, tg10). Step 4 and the Done share card wait on groups and the Mini App.
  creatorWizard: {
    title: "Amped.Bio on Telegram",
    steps: { link: "Link", bot: "Bot", messages: "Messages", page: "Page" },
    stepOf: (step: number) => `Step ${step} of 4`,
    close: "Close",
    next: "Next",
    linkTitle: "Put your page inside Telegram.",
    linkLines: [
      "Fans message you on Telegram, with a door you control.",
      "Your updates reach fans in the app they already open.",
    ],
    linkGroupLine: "Your Telegram group lets in the people who back you.",
    linkButton: "Link Telegram",
    linkFootnote: "We store your Telegram id and username. Never your phone.",
    botTitle: "Start the Amped.Bio bot.",
    botLine:
      "Open the bot in Telegram and press Start. It brings you fan messages and lets you reply from Telegram.",
    botStarted: "Bot started.",
    botKeepChat:
      "Keep this chat with the bot. If you delete it or stop the bot, fan messages and updates stop reaching you on Telegram until you press Start again.",
    messagesTitle: "Who can message you?",
    messagesButton: "Turn on messages",
    messagesOn: "Fan messages are on.",
    pageTitle: "Add the button to your page.",
    pageLine: "Fans tap it and Telegram opens with you selected.",
    pageLabelField: "Button label",
    pagePosition: "Where on your page",
    positions: { top: "Top", afterLinks: "After links", bottom: "Bottom" },
    pageButton: "Add to my page",
    pageOnPage: "The button is on your page.",
    doneTitle: "You are live on Telegram.",
    doneLine: "Share this link anywhere in Telegram.",
    doneCopy: "Copy link",
    doneCopied: "Link copied.",
    doneClose: "Done",
  },
  // PR 4: wizard B, fan link (row 122, tg11)
  fanLink: {
    cardLine: (creator: string) => `Message ${creator} on Telegram`,
    title: "Link Telegram once. Then message any creator.",
    updatesCheckbox: "Get updates from creators on Telegram",
    usernameCheckbox: "Let creators see my Telegram username",
    footnote:
      "Linking lets the Amped.Bio bot reply to you. Nothing is sent until you write first or turn on updates.",
    linkedTitle: "Linked.",
    linkedLine: (creator: string) => `Telegram will open with ${creator} selected.`,
    openTelegram: "Open Telegram",
    unavailable: "Telegram is not available right now. Try again later.",
  },
  // PR 4: Home checklist item 6 (row 123, tg12)
  homeItem: "Add Telegram",
  homeDone: "Telegram is set up.",
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
  // PR 3: fan to creator messages
  fanWrote: (fan: string, text: string) => `${fan}: ${text}`,
  messageTooLong: "Messages are 2,000 characters or fewer. Send a shorter one.",
  fanCapReached: "You have reached the message limit for now. Try again later.",
  senderPaused: "Sending is paused on your account for now. Try again tomorrow.",
  replyThreadClosed: "This conversation is closed. Your reply was not sent.",
  dmNotFound: "That page is not on Amped.Bio. Check the link and try again.",
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
