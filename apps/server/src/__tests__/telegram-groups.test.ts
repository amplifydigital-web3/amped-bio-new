/**
 * Messaging on Telegram (Build Board #2), PR 5: gated groups and inline cards (spec r3
 * 3.2 to 3.6; acceptance 11, 12, 13, 14). Real grammY update handling with the Bot API
 * replaced by a recorder; the database is the in memory fake.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Bot } from "grammy";
import { TELEGRAM_BOT_STRINGS } from "@repo/constants";

const fake = vi.hoisted(() => ({ db: null as any }));
vi.mock("@repo/database", async () => {
  const helper = await import("./helpers/fakeMessagingDb");
  fake.db = helper.createFakeDb();
  return {
    prisma: fake.db.client,
    Prisma: helper.fakePrismaNamespace,
    withNumericIdCoercion: (client: unknown) => client,
  };
});
const shared = vi.hoisted(() => ({ bot: null as any }));
vi.mock("../services/telegram/client", () => ({
  isTelegramConfigured: () => true,
  getTelegramBot: () => shared.bot,
  telegramBotId: () => 123,
  getBotUsername: async () => "AmpedBioStagingBot",
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));
vi.mock("../utils/cache", () => ({
  getRedisClient: () => null,
  cache: { set: vi.fn(), get: vi.fn(async () => null), delete: vi.fn() },
}));

import { env } from "../env";
import { installBotHandlers } from "../services/telegram/bot";
import { encodeLinkCode } from "../services/telegram/linkCodes";
import {
  GroupError,
  connectGroup,
  parsePublicGroupRef,
  previewRule,
  runGroupCheck,
} from "../services/telegram/groups";
import {
  ANA,
  JORDAN,
  MAYA,
  SAM,
  follow,
  linkTelegram,
  openMessages,
  outboxRows,
  seedPeople,
} from "./helpers/messagingFixtures";

const CHAT = -100555;
const MAYA_TG = 9001;
const JORDAN_TG = 9002;
const SAM_TG = 9003;
const STRANGER_TG = 9999;
const BOT_ID = 123;

type Call = { method: string; payload: Record<string, any> };
let calls: Call[] = [];
let updateId = 1;
let botRights = { can_invite_users: true, can_restrict_members: true };

function makeBot() {
  const bot = new Bot("123:test", {
    botInfo: {
      id: BOT_ID,
      is_bot: true,
      first_name: "Amped.Bio",
      username: "AmpedBioStagingBot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: true,
      can_connect_to_business: false,
      has_main_web_app: false,
    } as never,
  });
  bot.api.config.use(async (_prev, method, payload) => {
    const p = payload as Record<string, any>;
    calls.push({ method, payload: p });
    const result = (() => {
      switch (method) {
        case "getChatMember":
          if (p.user_id === BOT_ID) return { status: "administrator", ...botRights };
          if (p.user_id === MAYA_TG) return { status: "creator" };
          return { status: "member" };
        case "getChatAdministrators":
          return [{ status: "creator", user: { id: MAYA_TG } }];
        case "createChatInviteLink":
          return { invite_link: "https://t.me/+approvalOnly" };
        case "getChatMemberCount":
          return 42;
        case "sendMessage":
          return { message_id: 900 + calls.length };
        default:
          return true;
      }
    })();
    return { ok: true, result } as never;
  });
  installBotHandlers(bot);
  return bot;
}

const user = (id: number) => ({ id, is_bot: false, first_name: "U" });
const groupChat = { id: CHAT, type: "supergroup", title: "Maya's Studio Circle members" };

function botMemberUpdate(fromId: number, status: string) {
  return {
    update_id: updateId++,
    my_chat_member: {
      chat: groupChat,
      from: user(fromId),
      date: 0,
      old_chat_member: { status: "left", user: { id: BOT_ID, is_bot: true, first_name: "B" } },
      new_chat_member: {
        status,
        user: { id: BOT_ID, is_bot: true, first_name: "B" },
        ...(status === "administrator" ? botRights : {}),
      },
    },
  };
}

function joinRequest(fromId: number) {
  return {
    update_id: updateId++,
    chat_join_request: { chat: groupChat, from: user(fromId), user_chat_id: fromId, date: 0 },
  };
}

function textUpdate(fromId: number, text: string) {
  return {
    update_id: updateId++,
    message: {
      message_id: 300 + updateId,
      date: 0,
      chat: { id: fromId, type: "private", first_name: "U" },
      from: user(fromId),
      text,
      entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }],
    },
  };
}

const sent = (method: string) => calls.filter(c => c.method === method);
const groups = () => fake.db.table("telegramGroup");
const members = () => fake.db.table("telegramGroupMember");

function connectedGroup(over: Record<string, unknown> = {}) {
  const row = {
    id: Buffer.alloc(16, 7),
    creatorUserId: MAYA,
    tgChatId: BigInt(CHAT),
    title: "Maya's Studio Circle members",
    ruleKind: "FOLLOWER",
    stakeMin: null,
    inviteLink: "https://t.me/+approvalOnly",
    botIsAdmin: true,
    removeUnverified: false,
    memberCount: 3,
    addedByTelegramUserId: BigInt(MAYA_TG),
    connectedAt: new Date(),
    lastCheckedAt: null,
    disconnectedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
  groups().push(row);
  return row;
}

function member(telegramUserId: number, userId: number | null) {
  members().push({
    id: Buffer.alloc(16, telegramUserId % 250),
    groupId: Buffer.alloc(16, 7),
    telegramUserId: BigInt(telegramUserId),
    userId,
    approvedAt: new Date(),
    declinedAt: null,
    removedAt: null,
    removedReason: null,
    lastVerifiedAt: null,
    createdAt: new Date(),
  });
}

beforeEach(() => {
  fake.db.reset();
  calls = [];
  botRights = { can_invite_users: true, can_restrict_members: true };
  seedPeople(fake.db);
  linkTelegram(fake.db, MAYA, MAYA_TG);
  linkTelegram(fake.db, JORDAN, JORDAN_TG);
  Object.assign(env, {
    TELEGRAM_ENABLED: true,
    TELEGRAM_GROUPS: true,
    TELEGRAM_BOT_TOKEN: "123:test",
    MESSAGING_INVITE_ONLY: false,
  });
  shared.bot = makeBot();
});

describe("the bot finds the group (tg-group-connect)", () => {
  it("a linked creator making the bot an admin leaves a pending group and a private note", async () => {
    await shared.bot.handleUpdate(botMemberUpdate(MAYA_TG, "administrator"));
    expect(groups()).toHaveLength(1);
    expect(groups()[0]).toMatchObject({ creatorUserId: MAYA, botIsAdmin: true, connectedAt: null });
    expect(outboxRows(fake.db, "notice")[0]!.payload.text).toBe(
      TELEGRAM_BOT_STRINGS.botAddedAdmin("Maya's Studio Circle members")
    );
    expect(sent("sendMessage")).toHaveLength(0);
  });

  it("an unlinked user adding the bot leaves nothing", async () => {
    await shared.bot.handleUpdate(botMemberUpdate(STRANGER_TG, "administrator"));
    expect(groups()).toHaveLength(0);
  });

  it("the bot added without admin rights asks for them, privately", async () => {
    await shared.bot.handleUpdate(botMemberUpdate(MAYA_TG, "member"));
    expect(groups()[0]).toMatchObject({ botIsAdmin: false });
    expect(outboxRows(fake.db, "notice")[0]!.payload.text).toBe(
      TELEGRAM_BOT_STRINGS.botAddedNoAdmin
    );
  });
});

describe("connect (acceptance 11)", () => {
  it("confirms a found group: approval only link, rule, connected", async () => {
    await shared.bot.handleUpdate(botMemberUpdate(MAYA_TG, "administrator"));
    const group = await connectGroup(MAYA, groups()[0].id, "POOL_MEMBER", null);
    expect(group).toMatchObject({
      inviteLink: "https://t.me/+approvalOnly",
      ruleKind: "POOL_MEMBER",
      memberCount: 42,
    });
    expect(group.connectedAt).toBeInstanceOf(Date);
    expect(sent("createChatInviteLink")[0]!.payload.creates_join_request).toBe(true);
  });

  it("refuses while the bot lacks Ban users", async () => {
    await shared.bot.handleUpdate(botMemberUpdate(MAYA_TG, "administrator"));
    botRights = { can_invite_users: true, can_restrict_members: false };
    await expect(connectGroup(MAYA, groups()[0].id, "FOLLOWER", null)).rejects.toMatchObject({
      code: "not_admin",
    });
  });

  it("another creator cannot confirm Maya's group", async () => {
    await shared.bot.handleUpdate(botMemberUpdate(MAYA_TG, "administrator"));
    await expect(connectGroup(ANA, groups()[0].id, "FOLLOWER", null)).rejects.toBeInstanceOf(
      GroupError
    );
  });

  it("stops at 3 connected groups", async () => {
    for (const n of [1, 2, 3]) {
      connectedGroup({ id: Buffer.alloc(16, n), tgChatId: BigInt(-n) });
    }
    groups().push({
      ...connectedGroup({ id: Buffer.alloc(16, 9), tgChatId: BigInt(-9) }),
      connectedAt: null,
    });
    groups().splice(3, 1);
    await expect(connectGroup(MAYA, Buffer.alloc(16, 9), "FOLLOWER", null)).rejects.toMatchObject({
      code: "limit",
    });
  });

  it("reads public usernames and refuses private links", () => {
    expect(parsePublicGroupRef("@mayastudio")).toBe("mayastudio");
    expect(parsePublicGroupRef("https://t.me/mayastudio")).toBe("mayastudio");
    expect(parsePublicGroupRef("t.me/+AbCdEf123")).toBeNull();
    expect(parsePublicGroupRef("https://t.me/joinchat/AbCd")).toBeNull();
  });
});

describe("join requests (acceptance 12)", () => {
  beforeEach(() => connectedGroup());

  it("a linked follower is approved and recorded", async () => {
    follow(fake.db, JORDAN, MAYA);
    await shared.bot.handleUpdate(joinRequest(JORDAN_TG));
    expect(sent("approveChatJoinRequest")).toHaveLength(1);
    expect(members()[0]).toMatchObject({ userId: JORDAN });
    expect(sent("sendMessage")[0]!.payload.text).toBe(
      TELEGRAM_BOT_STRINGS.groupApproved("Maya Lin")
    );
  });

  it("a linked fan who does not follow is declined with the rule and a page button", async () => {
    await shared.bot.handleUpdate(joinRequest(JORDAN_TG));
    expect(sent("declineChatJoinRequest")).toHaveLength(1);
    const message = sent("sendMessage")[0]!;
    expect(message.payload.text).toBe(TELEGRAM_BOT_STRINGS.groupDeclined.FOLLOWER("Maya Lin"));
    expect(message.payload.reply_markup.inline_keyboard[0][0].url).toMatch(/\/maya$/);
  });

  it("an unlinked applicant is declined and gets one message with Link Telegram", async () => {
    await shared.bot.handleUpdate(joinRequest(STRANGER_TG));
    expect(sent("declineChatJoinRequest")).toHaveLength(1);
    expect(sent("sendMessage")[0]!.payload.text).toBe(
      TELEGRAM_BOT_STRINGS.groupNotLinked("Maya Lin")
    );
  });
});

describe("the hourly check (acceptance 13)", () => {
  const job = () => ({ refId: Buffer.alloc(16, 7) }) as never;

  it("removes a member who stopped following, without a permanent ban, and tells them", async () => {
    connectedGroup();
    member(JORDAN_TG, JORDAN);
    await runGroupCheck(job());
    expect(sent("banChatMember")[0]!.payload.user_id).toBe(JORDAN_TG);
    expect(sent("unbanChatMember")[0]!.payload).toMatchObject({
      user_id: JORDAN_TG,
      only_if_banned: true,
    });
    expect(members()[0]).toMatchObject({ removedReason: "rule_failed" });
    expect(sent("sendMessage")[0]!.payload.text).toBe(
      TELEGRAM_BOT_STRINGS.groupRemoved("Maya Lin")
    );
  });

  it("keeps a member who qualifies, and never touches the creator or an admin", async () => {
    connectedGroup();
    follow(fake.db, JORDAN, MAYA);
    member(JORDAN_TG, JORDAN);
    member(MAYA_TG, MAYA);
    await runGroupCheck(job());
    expect(sent("banChatMember")).toHaveLength(0);
    expect(members().every((m: any) => m.removedAt === null)).toBe(true);
  });

  it("removes a member who unlinked Telegram, and leaves unverified members alone by default", async () => {
    connectedGroup();
    member(SAM_TG, SAM);
    member(STRANGER_TG, null);
    await runGroupCheck(job());
    expect(sent("banChatMember").map(c => c.payload.user_id)).toEqual([SAM_TG]);
    expect(members().find((m: any) => m.userId === SAM)).toMatchObject({
      removedReason: "unlinked",
    });
    expect(members().find((m: any) => m.userId === null)!.removedAt).toBeNull();
  });

  it("removes unverified members when the creator turned that on", async () => {
    connectedGroup({ removeUnverified: true });
    member(STRANGER_TG, null);
    await runGroupCheck(job());
    expect(members()[0]).toMatchObject({ removedReason: "unverified" });
  });

  it("marks the bot without rights and removes no one", async () => {
    connectedGroup();
    member(JORDAN_TG, JORDAN);
    botRights = { can_invite_users: false, can_restrict_members: true };
    await runGroupCheck(job());
    expect(groups()[0]).toMatchObject({ botIsAdmin: false });
    expect(sent("banChatMember")).toHaveLength(0);
  });

  it("previews how many members a stricter rule would remove", async () => {
    connectedGroup();
    follow(fake.db, JORDAN, MAYA);
    member(JORDAN_TG, JORDAN);
    expect(await previewRule(MAYA, Buffer.alloc(16, 7), "POOL_MEMBER", null)).toEqual({
      wouldRemove: 1,
    });
    fake.db.stakes.push({ poolId: 70, userId: JORDAN, amount: 10n });
    expect(await previewRule(MAYA, Buffer.alloc(16, 7), "POOL_MEMBER", null)).toEqual({
      wouldRemove: 0,
    });
  });
});

describe("/start j_{code}", () => {
  beforeEach(() => connectedGroup());

  it("sends the invite to a fan who qualifies", async () => {
    follow(fake.db, JORDAN, MAYA);
    await shared.bot.handleUpdate(textUpdate(JORDAN_TG, `/start j_${encodeLinkCode(MAYA)}`));
    const reply = sent("sendMessage")[0]!;
    expect(reply.payload.text).toBe(TELEGRAM_BOT_STRINGS.groupInvite("Maya Lin"));
    expect(reply.payload.reply_markup.inline_keyboard[0][0].url).toBe("https://t.me/+approvalOnly");
  });

  it("explains the rule to a fan who does not", async () => {
    await shared.bot.handleUpdate(textUpdate(JORDAN_TG, `/start j_${encodeLinkCode(MAYA)}`));
    expect(sent("sendMessage")[0]!.payload.text).toBe(
      TELEGRAM_BOT_STRINGS.groupDeclined.FOLLOWER("Maya Lin")
    );
  });
});

describe("inline cards (acceptance 14, tg-inline-scope)", () => {
  function inlineQuery(query: string) {
    return {
      update_id: updateId++,
      inline_query: { id: "q1", from: user(JORDAN_TG), query, offset: "" },
    };
  }

  it("shows only the buttons that work for each creator", async () => {
    openMessages(fake.db, MAYA);
    connectedGroup();
    await shared.bot.handleUpdate(inlineQuery("ma"));
    const [answer] = sent("answerInlineQuery");
    const [card] = answer!.payload.results;
    expect(card.title).toBe("Maya Lin");
    const buttons = card.reply_markup.inline_keyboard.flat().map((b: any) => b.text);
    expect(buttons).toEqual(["Open page", "Message", "Join group"]);
    const message = card.reply_markup.inline_keyboard[1][0].url as string;
    expect(message).toBe(`https://t.me/AmpedBioStagingBot?start=m_${encodeLinkCode(MAYA)}`);
  });

  it("a creator with messages off and no group gets Open page only", async () => {
    await shared.bot.handleUpdate(inlineQuery("ana"));
    const [card] = sent("answerInlineQuery")[0]!.payload.results;
    expect(card.reply_markup.inline_keyboard.flat().map((b: any) => b.text)).toEqual(["Open page"]);
  });

  it("never lists a suspended or unpublished page", async () => {
    fake.db.table("user").find((u: any) => u.id === ANA).block = "yes";
    await shared.bot.handleUpdate(inlineQuery("ana"));
    expect(sent("answerInlineQuery")[0]!.payload.results).toEqual([]);
  });
});
