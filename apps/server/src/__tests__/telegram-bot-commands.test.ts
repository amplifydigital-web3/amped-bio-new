/**
 * Messaging on Telegram (Build Board #2), PR 2: the bot's phase 0 commands
 * (spec 3.5, acceptance 2 and 3). Runs real grammY update handling with the
 * Bot API replaced by a recorder, so the routing and the copy are exercised.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Bot } from "grammy";
import { TELEGRAM_BOT_STRINGS } from "@repo/constants";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    telegramAccount: { findUnique: fn(), update: fn() },
    telegramLinkEvent: { create: fn() },
    notificationPreference: { findUnique: fn(), upsert: fn(), updateMany: fn() },
    user: { findUnique: fn() },
    follow: { findMany: fn() },
  };
});
vi.mock("@repo/database", () => ({ prisma: db, Prisma: {} }));

import { installBotHandlers } from "../services/telegram/bot";

const TG_USER = 555;
type Call = { method: string; payload: Record<string, any> };
let calls: Call[] = [];

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
    return { ok: true, result: { message_id: 1 } } as never;
  });
  installBotHandlers(bot);
  return bot;
}

let updateId = 1;
function command(text: string, chatType: "private" | "group" = "private") {
  const command = text.split(" ")[0]!;
  return {
    update_id: updateId++,
    message: {
      message_id: 1,
      date: 0,
      chat:
        chatType === "private"
          ? { id: TG_USER, type: "private", first_name: "M" }
          : { id: -5, type: "group", title: "G" },
      from: { id: TG_USER, is_bot: false, first_name: "M" },
      text,
      entities: [{ type: "bot_command", offset: 0, length: command.length }],
    },
  };
}

function account(over: Record<string, unknown> = {}) {
  return {
    id: Buffer.alloc(16),
    userId: 7,
    telegramUserId: BigInt(TG_USER),
    botAccess: true,
    blockedAt: null,
    ...over,
  };
}

const replies = () => calls.filter(c => c.method === "sendMessage");

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  db.user.findUnique.mockResolvedValue({ handle: "jordan", name: "Jordan" });
  db.follow.findMany.mockResolvedValue([{ creator: { handle: "maya", name: "Maya Lin" } }]);
});

describe("/start", () => {
  it("not linked: explains, offers Link Telegram, stores nothing", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(null);
    await makeBot().handleUpdate(command("/start") as never);
    const [reply] = replies();
    expect(reply!.payload.text).toBe(TELEGRAM_BOT_STRINGS.startNotLinked);
    expect(reply!.payload.reply_markup.inline_keyboard[0][0].text).toBe("Link Telegram");
    expect(reply!.payload.reply_markup.inline_keyboard[0][0].url).toContain("link=telegram");
    expect(db.telegramAccount.update).not.toHaveBeenCalled();
  });

  it("linked without bot access: grants it, records bot_started, greets as first time", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account({ botAccess: false }));
    await makeBot().handleUpdate(command("/start") as never);
    expect(db.telegramAccount.update.mock.calls[0]![0].data).toMatchObject({
      botAccess: true,
      blockedAt: null,
    });
    expect(db.telegramLinkEvent.create.mock.calls[0]![0].data.kind).toBe("bot_started");
    const [reply] = replies();
    expect(reply!.payload.text).toBe(TELEGRAM_BOT_STRINGS.startLinkedFirst("@jordan"));
    expect(reply!.payload.reply_markup.inline_keyboard[0][0].text).toBe(
      "Open Maya Lin on Amped.Bio"
    );
  });

  it("linked and reachable: greets as returning, changes nothing", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account());
    await makeBot().handleUpdate(command("/start") as never);
    expect(db.telegramAccount.update).not.toHaveBeenCalled();
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.startLinkedReturning("@jordan"));
  });

  it("a start payload from a later phase is answered as a plain /start", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account());
    await makeBot().handleUpdate(command("/start ref_maya") as never);
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.startLinkedReturning("@jordan"));
  });

  it("never answers in a group", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account());
    await makeBot().handleUpdate(command("/start", "group") as never);
    expect(replies()).toHaveLength(0);
  });
});

describe("/stop", () => {
  it("turns Telegram delivery off everywhere and records updates_off with the policy version", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account());
    db.notificationPreference.findUnique.mockResolvedValue({ telegramEnabled: true });
    await makeBot().handleUpdate(command("/stop") as never);
    expect(db.notificationPreference.upsert.mock.calls[0]![0].update).toEqual({
      telegramEnabled: false,
    });
    expect(db.notificationPreference.updateMany).toHaveBeenCalled();
    const event = db.telegramLinkEvent.create.mock.calls[0]![0].data;
    expect(event).toMatchObject({ kind: "updates_off", source: "stop_command" });
    expect(event.policyVersion).toBeTruthy();
    expect(replies()[0]!.payload.text).toBe(TELEGRAM_BOT_STRINGS.stop);
  });
});

describe("/help and /privacy", () => {
  it("answer with the counsel copy and links", async () => {
    const bot = makeBot();
    await bot.handleUpdate(command("/help") as never);
    await bot.handleUpdate(command("/privacy") as never);
    const [help, privacy] = replies();
    expect(help!.payload.text).toBe(TELEGRAM_BOT_STRINGS.help);
    expect(privacy!.payload.text).toBe(TELEGRAM_BOT_STRINGS.privacy);
    expect(privacy!.payload.reply_markup.inline_keyboard[0][0].url).toMatch(/\/privacy$/);
  });
});

describe("my_chat_member in the private chat", () => {
  const member = (status: string) => ({
    update_id: updateId++,
    my_chat_member: {
      chat: { id: TG_USER, type: "private", first_name: "M" },
      from: { id: TG_USER, is_bot: false, first_name: "M" },
      date: 0,
      old_chat_member: { status: "member", user: { id: 123, is_bot: true, first_name: "B" } },
      new_chat_member: { status, user: { id: 123, is_bot: true, first_name: "B" }, until_date: 0 },
    },
  });

  it("kicked sets blockedAt and records bot_blocked", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account());
    await makeBot().handleUpdate(member("kicked") as never);
    expect(db.telegramAccount.update.mock.calls[0]![0].data.blockedAt).toBeInstanceOf(Date);
    expect(db.telegramLinkEvent.create.mock.calls[0]![0].data.kind).toBe("bot_blocked");
  });

  it("member after a block clears it and records bot_unblocked", async () => {
    db.telegramAccount.findUnique.mockResolvedValue(account({ blockedAt: new Date() }));
    await makeBot().handleUpdate(member("member") as never);
    expect(db.telegramAccount.update.mock.calls[0]![0].data).toEqual({
      blockedAt: null,
      botAccess: true,
    });
    expect(db.telegramLinkEvent.create.mock.calls[0]![0].data.kind).toBe("bot_unblocked");
  });
});
