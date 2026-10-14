import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import { apiThrottler } from "@grammyjs/transformer-throttler";
import { TELEGRAM_LIMITS } from "@repo/constants";
import { env } from "../../env";

/**
 * Messaging on Telegram (Build Board #2), spec 3.5. One grammY client for the whole
 * process. Every send goes through the throttler (30 per second global, 1 per second
 * per chat, 20 per minute per group) and auto retry on 429 up to 300 seconds, so the
 * rate limits in the spec hold without any caller thinking about them.
 *
 * The bot never polls. Updates arrive through POST /webhooks/telegram and are
 * replayed to `bot.handleUpdate` by the sender loop. Handlers register in later PRs.
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

/** Test seam: drop the cached client and getMe result so a test can change env between cases. */
export function resetTelegramBotForTests() {
  bot = null;
  cachedMe = null;
}
