/**
 * The bot username is resolved from the Bot API getMe() so it always matches
 * the token in use, instead of a guessed env value. TELEGRAM_BOT_USERNAME
 * stays as an override for tests and split environments.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  token: "" as string,
  username: "AmpedBioStagingBot" as string | undefined,
  getMeFails: false,
  apiHost: "api.staging.amped.bio",
  webhookSecret: "hook_secret",
  setWebhook: vi.fn(async () => true),
}));

vi.mock("../env", () => ({
  env: {
    get TELEGRAM_ENABLED() {
      return state.token.length > 0;
    },
    get TELEGRAM_BOT_TOKEN() {
      return state.token;
    },
    TELEGRAM_BOT_USERNAME: "",
    get API_HOST() {
      return state.apiHost;
    },
    get TELEGRAM_WEBHOOK_SECRET() {
      return state.webhookSecret;
    },
  },
}));

vi.mock("grammy", () => ({
  Bot: class {
    api;
    constructor(token: string) {
      this.api = {
        config: { use: vi.fn() },
        getMe: vi.fn(async () => {
          if (state.getMeFails) throw new Error("api down");
          return { id: Number(token.split(":")[0]), username: state.username, is_bot: true };
        }),
        setWebhook: state.setWebhook,
      };
    }
  },
}));

// The real handlers need a real grammY Bot; this suite stubs Bot, so stub them too
vi.mock("../services/telegram/bot", () => ({ installBotHandlers: vi.fn() }));

import {
  getBotUsername,
  registerTelegramWebhook,
  resetTelegramBotForTests,
  telegramBotId,
  telegramWebhookUrl,
} from "../services/telegram/client";

beforeEach(async () => {
  state.token = "";
  state.username = "AmpedBioStagingBot";
  state.getMeFails = false;
  state.apiHost = "api.staging.amped.bio";
  state.webhookSecret = "hook_secret";
  state.setWebhook.mockReset();
  state.setWebhook.mockResolvedValue(true);
  const envModule = await import("../env");
  (envModule.env as { TELEGRAM_BOT_USERNAME: string }).TELEGRAM_BOT_USERNAME = "";
  resetTelegramBotForTests();
});

describe("getBotUsername", () => {
  it("returns null while the bot is not configured", async () => {
    expect(await getBotUsername()).toBeNull();
  });

  it("resolves the username from getMe once and caches it", async () => {
    state.token = "12345:AaBbCc";
    expect(await getBotUsername()).toBe("AmpedBioStagingBot");
    state.username = "RenamedBot";
    expect(await getBotUsername()).toBe("AmpedBioStagingBot");
  });

  it("prefers the TELEGRAM_BOT_USERNAME override without touching the API", async () => {
    const envModule = await import("../env");
    (envModule.env as { TELEGRAM_BOT_USERNAME: string }).TELEGRAM_BOT_USERNAME = "OverrideBot";
    state.token = "12345:AaBbCc";
    expect(await getBotUsername()).toBe("OverrideBot");
  });

  it("returns null when getMe fails and retries on the next call", async () => {
    state.token = "12345:AaBbCc";
    state.getMeFails = true;
    expect(await getBotUsername()).toBeNull();
    state.getMeFails = false;
    expect(await getBotUsername()).toBe("AmpedBioStagingBot");
  });

  it("telegramBotId still reads the token prefix without the API", () => {
    state.token = "12345:AaBbCc";
    expect(telegramBotId()).toBe(12345);
    state.token = "";
    expect(telegramBotId()).toBeNull();
  });
});

describe("registerTelegramWebhook", () => {
  it("points the bot at this API's webhook route with the secret and the handled updates", async () => {
    state.token = "123456:abc";
    expect(await registerTelegramWebhook()).toBe(true);
    expect(state.setWebhook).toHaveBeenCalledWith(
      "https://api.staging.amped.bio/webhooks/telegram",
      {
        secret_token: "hook_secret",
        allowed_updates: ["message", "callback_query", "my_chat_member"],
      }
    );
  });

  it("does nothing while the bot is not configured", async () => {
    expect(await registerTelegramWebhook()).toBe(false);
    expect(state.setWebhook).not.toHaveBeenCalled();
  });

  it("skips a local API_HOST so a dev server never takes the shared bot's webhook", async () => {
    state.token = "123456:abc";
    for (const host of ["localhost:43000", "http://127.0.0.1:24300", "[::1]"]) {
      state.apiHost = host;
      expect(telegramWebhookUrl()).toBeNull();
      expect(await registerTelegramWebhook()).toBe(false);
    }
    expect(state.setWebhook).not.toHaveBeenCalled();
  });

  it("skips registration without a secret, since the route would refuse every update", async () => {
    state.token = "123456:abc";
    state.webhookSecret = "";
    expect(await registerTelegramWebhook()).toBe(false);
    expect(state.setWebhook).not.toHaveBeenCalled();
  });

  it("logs a Bot API failure instead of throwing", async () => {
    state.token = "123456:abc";
    state.setWebhook.mockRejectedValueOnce(new Error("bad secret"));
    expect(await registerTelegramWebhook()).toBe(false);
  });

  it("strips a scheme and trailing slash from API_HOST", () => {
    state.apiHost = "https://api.amped.bio/";
    expect(telegramWebhookUrl()).toBe("https://api.amped.bio/webhooks/telegram");
  });
});
