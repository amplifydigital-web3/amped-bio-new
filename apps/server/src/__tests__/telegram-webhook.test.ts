/**
 * Messaging on Telegram (Build Board #2), acceptance 4: the webhook rejects a wrong
 * secret with 401, ignores a duplicate update_id, and acknowledges a 1,000 update
 * burst fast because the request only writes a row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  class KnownError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  const seenUpdateIds = new Set<string>();
  const inbox: any[] = [];
  return {
    KnownError,
    seenUpdateIds,
    inbox,
    prisma: {
      telegramUpdateLog: {
        create: vi.fn(async ({ data }: any) => {
          const key = String(data.updateId);
          if (seenUpdateIds.has(key)) throw new KnownError("P2002");
          seenUpdateIds.add(key);
          return data;
        }),
      },
      telegramInbox: {
        create: vi.fn(async ({ data }: any) => {
          inbox.push(data);
          return data;
        }),
      },
    },
  };
});

vi.mock("@repo/database", () => ({
  prisma: db.prisma,
  Prisma: { PrismaClientKnownRequestError: db.KnownError },
}));
vi.mock("../utils/cache", () => ({ getRedisClient: () => null }));

import { env } from "../env";
import { chatIdOf, handleTelegramWebhook, secretMatches } from "../routes/telegram";

function call(body: unknown, headers: Record<string, string> = {}, ip = "149.154.161.1") {
  const res = {
    statusCode: 0,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.headersSent = true;
      return this;
    },
  };
  const req = { body, headers, ip } as any;
  return handleTelegramWebhook(req, res as any).then(() => res.statusCode);
}

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!;

describe("POST /webhooks/telegram", () => {
  beforeEach(() => {
    db.seenUpdateIds.clear();
    db.inbox.length = 0;
    (env as any).TELEGRAM_ENABLED = true;
  });

  it("answers 404 while TELEGRAM_ENABLED is off", async () => {
    (env as any).TELEGRAM_ENABLED = false;
    expect(await call({ update_id: 1 }, { "x-telegram-bot-api-secret-token": SECRET })).toBe(404);
  });

  it("rejects a missing or wrong secret with 401 and writes nothing", async () => {
    expect(await call({ update_id: 1 })).toBe(401);
    expect(await call({ update_id: 1 }, { "x-telegram-bot-api-secret-token": "wrong" })).toBe(401);
    expect(db.inbox).toHaveLength(0);
  });

  it("secretMatches is constant time safe and refuses an empty expected value", () => {
    expect(secretMatches("abc", "abc")).toBe(true);
    expect(secretMatches("abc", "abd")).toBe(false);
    expect(secretMatches("abc", "")).toBe(false);
    expect(secretMatches(undefined, "abc")).toBe(false);
  });

  it("writes one inbox row per new update and ignores a duplicate update_id", async () => {
    const headers = { "x-telegram-bot-api-secret-token": SECRET };
    const update = { update_id: 77, message: { message_id: 1, chat: { id: 4242 }, text: "hi" } };
    expect(await call(update, headers)).toBe(200);
    expect(await call(update, headers)).toBe(200);
    expect(db.inbox).toHaveLength(1);
    expect(db.inbox[0].updateId).toBe(77n);
    expect(db.inbox[0].chatId).toBe(4242n);
  });

  it("answers 200 to a body that is not an update so Telegram does not retry it", async () => {
    const headers = { "x-telegram-bot-api-secret-token": SECRET };
    expect(await call({ hello: "world" }, headers)).toBe(200);
    expect(db.inbox).toHaveLength(0);
  });

  it("acknowledges a 1,000 update burst in well under a second each", async () => {
    const headers = { "x-telegram-bot-api-secret-token": SECRET };
    const started = Date.now();
    const codes = await Promise.all(
      Array.from({ length: 1000 }, (_, i) =>
        call(
          { update_id: 10_000 + i, message: { chat: { id: i % 7 } } },
          headers,
          `10.0.0.${i % 50}`
        )
      )
    );
    const elapsed = Date.now() - started;
    expect(codes.every(c => c === 200 || c === 429)).toBe(true);
    expect(codes.filter(c => c === 200).length).toBe(db.inbox.length);
    expect(elapsed).toBeLessThan(5000);
  });

  it("extracts the chat id from every update kind the loop orders by", () => {
    expect(chatIdOf({ message: { chat: { id: 1 } } })).toBe(1n);
    expect(chatIdOf({ callback_query: { from: { id: 2 }, message: { chat: { id: 3 } } } })).toBe(
      3n
    );
    expect(chatIdOf({ chat_join_request: { chat: { id: -100 } } })).toBe(-100n);
    expect(chatIdOf({ my_chat_member: { chat: { id: 5 } } })).toBe(5n);
    expect(chatIdOf({ inline_query: { from: { id: 9 } } })).toBe(9n);
    expect(chatIdOf({ poll: {} })).toBeNull();
  });
});
