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
      };
    }
  },
}));

// The real handlers need a real grammY Bot; this suite stubs Bot, so stub them too
vi.mock("../services/telegram/bot", () => ({ installBotHandlers: vi.fn() }));

import {
  getBotUsername,
  resetTelegramBotForTests,
  telegramBotId,
} from "../services/telegram/client";

beforeEach(async () => {
  state.token = "";
  state.username = "AmpedBioStagingBot";
  state.getMeFails = false;
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
