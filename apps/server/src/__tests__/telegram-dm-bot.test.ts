/**
 * Messaging on Telegram (Build Board #2), PR 3: the bot side of fan to creator
 * messages (spec 3.5; acceptance 5, 6, 7). Real grammY update handling with the Bot
 * API replaced by a recorder; the database is the in memory fake.
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
vi.mock("../services/telegram/client", () => ({
  isTelegramConfigured: () => true,
  getTelegramBot: () => null,
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));
const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../utils/cache", () => ({
  getRedisClient: () => null,
  cache: {
    set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    delete: vi.fn(async (k: string) => store.delete(k)),
  },
}));

import { env } from "../env";
import { installBotHandlers } from "../services/telegram/bot";
import {
  JORDAN,
  MAYA,
  follow,
  linkTelegram,
  openMessages,
  outboxRows,
  seedPeople,
} from "./helpers/messagingFixtures";

const FAN_TG = 9002;
const CREATOR_TG = 9001;
type Call = { method: string; payload: Record<string, any> };
let calls: Call[] = [];
let updateId = 1;

function makeBot() {
  const bot = new Bot("123:test", {
    botInfo: {
      id: 123,
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
    calls.push({ method, payload: payload as Record<string, any> });
    return {
      ok: true,
      result: method === "sendMessage" ? { message_id: 900 + calls.length } : true,
    } as never;
  });
  installBotHandlers(bot);
  return bot;
}

const chat = (id: number) => ({ id, type: "private", first_name: "U" });
const from = (id: number) => ({ id, is_bot: false, first_name: "U" });

function textUpdate(fromId: number, text: string, extra: Record<string, unknown> = {}) {
  const isCommand = text.startsWith("/");
  return {
    update_id: updateId++,
    message: {
      message_id: 300 + updateId,
      date: 0,
      chat: chat(fromId),
      from: from(fromId),
      text,
      ...(isCommand
        ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] }
        : {}),
      ...extra,
    },
  };
}

function callbackUpdate(fromId: number, data: string) {
  return {
    update_id: updateId++,
    callback_query: {
      id: `cb${updateId}`,
      from: from(fromId),
      chat_instance: "x",
      data,
      message: { message_id: 1, date: 0, chat: chat(fromId) },
    },
  };
}

const replies = () => calls.filter(c => c.method === "sendMessage");
const reactions = () => calls.filter(c => c.method === "setMessageReaction");
const messages = () => fake.db.table("message");

beforeEach(() => {
  fake.db.reset();
  store.clear();
  calls = [];
  seedPeople(fake.db);
  openMessages(fake.db, MAYA, { ruleKind: "FOLLOWER" });
  linkTelegram(fake.db, MAYA, CREATOR_TG);
  linkTelegram(fake.db, JORDAN, FAN_TG);
  Object.assign(env, { MESSAGING_INVITE_ONLY: true });
});

describe("/start dm_{handle}", () => {
  it("a follower is told they are writing to the creator", async () => {
    follow(fake.db, JORDAN, MAYA);
    await makeBot().handleUpdate(textUpdate(FAN_TG, "/start dm_maya") as never);
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.dmReady("Maya Lin"));
  });

  it("a fan who does not qualify gets the rule in one line and a button to the page, and no thread", async () => {
    await makeBot().handleUpdate(textUpdate(FAN_TG, "/start dm_maya") as never);
    const [reply] = replies();
    expect(reply!.payload.text).toBe(TELEGRAM_BOT_STRINGS.dmRefused.FOLLOWER("Maya Lin"));
    expect(reply!.payload.reply_markup.inline_keyboard[0][0].text).toBe(
      "Open Maya Lin on Amped.Bio"
    );
    expect(reply!.payload.reply_markup.inline_keyboard[0][0].url).toMatch(/\/maya$/);
    expect(fake.db.table("messageThread")).toHaveLength(0);
  });

  it("an unknown handle gets dmNotFound", async () => {
    await makeBot().handleUpdate(textUpdate(FAN_TG, "/start dm_nobody") as never);
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.dmNotFound);
  });
});

describe("fan text", () => {
  beforeEach(() => follow(fake.db, JORDAN, MAYA));

  it("goes to the creator picked with /start dm_, is stored, queued and acknowledged with a reaction", async () => {
    const bot = makeBot();
    await bot.handleUpdate(textUpdate(FAN_TG, "/start dm_maya") as never);
    await bot.handleUpdate(textUpdate(FAN_TG, "Loved the set") as never);
    expect(messages()).toHaveLength(1);
    expect(messages()[0]).toMatchObject({
      sender: "FAN",
      channel: "TELEGRAM",
      body: "Loved the set",
    });
    expect(outboxRows(fake.db, "dm")[0]!.payload.to).toBe("creator");
    expect(reactions()).toHaveLength(1);
  });

  it("without a creator in mind gets the picker, and the kept text goes out after the pick", async () => {
    const bot = makeBot();
    await bot.handleUpdate(textUpdate(FAN_TG, "Hello there") as never);
    const picker = replies()[0]!;
    expect(picker.payload.text).toBe(TELEGRAM_BOT_STRINGS.pickCreator);
    expect(picker.payload.reply_markup.inline_keyboard[0][0]).toMatchObject({
      text: "Message Maya Lin",
      callback_data: `pick:${MAYA}`,
    });
    expect(messages()).toHaveLength(0);
    await bot.handleUpdate(callbackUpdate(FAN_TG, `pick:${MAYA}`) as never);
    expect(messages()[0]).toMatchObject({ body: "Hello there" });
  });

  it("over 2,000 characters is refused before anything is stored", async () => {
    const bot = makeBot();
    await bot.handleUpdate(textUpdate(FAN_TG, "/start dm_maya") as never);
    await bot.handleUpdate(textUpdate(FAN_TG, "x".repeat(2001)) as never);
    expect(replies().at(-1)!.payload.text).toBe(TELEGRAM_BOT_STRINGS.messageTooLong);
    expect(messages()).toHaveLength(0);
  });

  it("a photo gets Text only for now", async () => {
    const update = {
      update_id: updateId++,
      message: {
        message_id: 5,
        date: 0,
        chat: chat(FAN_TG),
        from: from(FAN_TG),
        photo: [{ file_id: "f", file_unique_id: "u", width: 1, height: 1 }],
      },
    };
    await makeBot().handleUpdate(update as never);
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.textOnly);
  });

  it("an unlinked Telegram user is asked to link", async () => {
    await makeBot().handleUpdate(textUpdate(5555, "hi") as never);
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.startNotLinked);
  });
});

describe("creator replies in Telegram (acceptance 7)", () => {
  beforeEach(() => follow(fake.db, JORDAN, MAYA));

  async function fanMessageForwarded(bot: Bot) {
    await bot.handleUpdate(textUpdate(FAN_TG, "/start dm_maya") as never);
    await bot.handleUpdate(textUpdate(FAN_TG, "Question for you") as never);
    // The delivery job sent the copy to the creator as message 777 in the creator's chat
    messages()[0].tgForwardMessageId = 777n;
  }

  it("a reply to the forwarded copy answers that fan", async () => {
    const bot = makeBot();
    await fanMessageForwarded(bot);
    await bot.handleUpdate(
      textUpdate(CREATOR_TG, "Here is the answer", {
        reply_to_message: { message_id: 777, date: 0, chat: chat(CREATOR_TG) },
      }) as never
    );
    const reply = messages().find((m: any) => m.sender === "CREATOR");
    expect(reply).toMatchObject({ body: "Here is the answer", channel: "TELEGRAM" });
    expect(outboxRows(fake.db, "dm").some((r: any) => r.payload.to === "fan")).toBe(true);
  });

  it("a creator who writes without replying gets the reply hint", async () => {
    const bot = makeBot();
    await fanMessageForwarded(bot);
    calls = [];
    await bot.handleUpdate(textUpdate(CREATOR_TG, "hello?") as never);
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.creatorNotAReply);
  });

  it("a reply into a blocked thread is not sent and says so", async () => {
    const bot = makeBot();
    await fanMessageForwarded(bot);
    fake.db.table("messageThread")[0].status = "BLOCKED_BY_CREATOR";
    calls = [];
    await bot.handleUpdate(
      textUpdate(CREATOR_TG, "late", {
        reply_to_message: { message_id: 777, date: 0, chat: chat(CREATOR_TG) },
      }) as never
    );
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.replyThreadClosed);
    expect(messages().filter((m: any) => m.sender === "CREATOR")).toHaveLength(0);
  });
});

describe("/creators", () => {
  it("lists followed creators as Message buttons, or says there are none", async () => {
    await makeBot().handleUpdate(textUpdate(FAN_TG, "/creators") as never);
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.creatorsNone);
    follow(fake.db, JORDAN, MAYA);
    calls = [];
    await makeBot().handleUpdate(textUpdate(FAN_TG, "/creators") as never);
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.creatorsList);
    expect(replies()[0]!.payload.reply_markup.inline_keyboard[0][0].callback_data).toBe(
      `pick:${MAYA}`
    );
  });
});
