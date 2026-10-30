import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { TELEGRAM_LIMITS } from "@repo/constants";
import { env } from "../../env";
import { installBotHandlers } from "./bot";

/**
 * Messaging on Telegram (Build Board #2), spec 3.5. One grammY client for the whole
 * process. Every send goes through the throttler (30 per second global, 1 per second
 * per chat, 20 per minute per group) and auto retry on 429 up to 300 seconds, so the
 * rate limits in the spec hold without any caller thinking about them.
 *
 * The bot never polls. Updates arrive through POST /webhooks/telegram, which
 * registerTelegramWebhook points the bot at on startup, and are replayed to
 * `bot.handleUpdate` by the sender loop. Handlers live in ./bot.ts.
 */

let bot: Bot | null = null;
let cachedMe: { id: number; username: string | null } | null = null;

export function isTelegramConfigured(): boolean {
  return env.TELEGRAM_ENABLED && env.TELEGRAM_BOT_TOKEN.length > 0;
}

export function getTelegramBot(): Bot | null {
  if (!isTelegramConfigured()) return null;
  if (bot) return bot;
  bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  bot.api.config.use(
    apiThrottler({
      global: { maxConcurrent: 1, minTime: Math.ceil(1000 / TELEGRAM_LIMITS.sendPerSecond) },
      out: { maxConcurrent: 1, minTime: Math.ceil(1000 / TELEGRAM_LIMITS.sendPerChatPerSecond) },
      group: {
        maxConcurrent: 1,
        minTime: Math.ceil(60_000 / TELEGRAM_LIMITS.sendPerGroupPerMinute),
      },
    })
  );
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 300 }));
  installBotHandlers(bot);
  return bot;
}

/** Bot id, the numeric prefix of the token. Used as the OIDC audience and in chat member checks. */
export function telegramBotId(): number | null {
  const prefix = env.TELEGRAM_BOT_TOKEN.split(":")[0];
  const id = Number(prefix);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The bot's own username, resolved from the Bot API `getMe()` so it always
 * matches the token in use instead of a guessed env value. One call per
 * process, then cached. `TELEGRAM_BOT_USERNAME` stays as an override for
 * tests or a split environment where the token cannot reach the API.
 */
export async function getBotUsername(): Promise<string | null> {
  if (env.TELEGRAM_BOT_USERNAME) return env.TELEGRAM_BOT_USERNAME;
  const bot = getTelegramBot();
  if (!bot) return null;
  if (cachedMe) return cachedMe.username;
  try {
    const me = await bot.api.getMe();
    cachedMe = { id: me.id, username: me.username ?? null };
  } catch (error) {
    console.error("[telegram] getMe failed, deep links stay unavailable:", error);
    return null;
  }
  return cachedMe.username;
}

/** Update kinds the handlers in ./bot.ts read. Telegram does not send the others. */
export const TELEGRAM_ALLOWED_UPDATES = ["message", "callback_query", "my_chat_member"] as const;

/**
 * The webhook URL on this API's public host, or null when API_HOST is local:
 * Telegram cannot reach it, and registering it would take the bot's single
 * webhook away from the environment that shares the token.
 */
export function telegramWebhookUrl(): string | null {
  const host = env.API_HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return null;
  return `https://${host}/webhooks/telegram`;
}

/**
 * Points the bot's webhook at this API on startup, so no environment depends on a
 * manual setWebhook call. Telegram never returns the secret, so the call is made
 * every boot; it is idempotent, which keeps several instances safe. Returns true
 * when Telegram accepted it. Failures are logged and never stop the server.
 */
export async function registerTelegramWebhook(): Promise<boolean> {
  const bot = getTelegramBot();
  if (!bot) return false;
  const url = telegramWebhookUrl();
  if (!url) {
    console.log("[telegram] webhook not registered: API_HOST is local");
    return false;
  }
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    console.error(
      "[telegram] webhook not registered: TELEGRAM_WEBHOOK_SECRET is empty, the route would refuse every update"
    );
    return false;
  }
  try {
    await bot.api.setWebhook(url, {
      secret_token: env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
    });
    console.log(`[telegram] webhook registered at ${url}`);
    return true;
  } catch (error) {
    console.error("[telegram] setWebhook failed, updates will not arrive:", error);
    return false;
  }
}

/** Test seam: drop the cached client and getMe result so a test can change env between cases. */
export function resetTelegramBotForTests() {
  bot = null;
  cachedMe = null;
}
