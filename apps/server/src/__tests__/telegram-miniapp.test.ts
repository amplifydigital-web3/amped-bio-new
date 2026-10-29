/**
 * Messaging on Telegram (Build Board #2), PR 6: the Mini App (spec r3 3.7, acceptance 15).
 * Launch data is signed here with the test bot token, the way Telegram signs it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
const shared = vi.hoisted(() => ({ prepared: [] as any[] }));
vi.mock("../services/telegram/client", () => ({
  isTelegramConfigured: () => true,
  telegramBotId: () => 123,
  getBotUsername: async () => "AmpedBioStagingBot",
  getTelegramBot: () => ({
    api: {
      savePreparedInlineMessage: async (userId: number, result: unknown, other: unknown) => {
        shared.prepared.push({ userId, result, other });
        return { id: "prep1", expiration_date: 0 };
      },
    },
  }),
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));
vi.mock("../utils/cache", () => ({
  getRedisClient: () => null,
  cache: { set: vi.fn(), get: vi.fn(async () => null), delete: vi.fn() },
}));

import { env } from "../env";
import { initDataHash, validateInitData } from "../services/telegram/initData";
import { encodeLinkCode } from "../services/telegram/linkCodes";
import {
  MiniAppError,
  buildMiniAppPage,
  miniAppFollow,
  prepareMiniAppShare,
} from "../services/telegram/miniapp";
import {
  ANA,
  JORDAN,
  MAYA,
  follow,
  linkTelegram,
  openMessages,
  seedPeople,
} from "./helpers/messagingFixtures";

const TOKEN = "123:test";
const JORDAN_TG = 9002;
const STRANGER_TG = 9999;
const NOW = new Date("2026-10-29T12:00:00Z");

function sign(fields: Record<string, string>, token = TOKEN) {
  const params = new URLSearchParams(fields);
  params.set("hash", initDataHash(Array.from(params.entries()), token));
  return params.toString();
}

function launch(telegramUserId: number, startParam: string, at = NOW) {
  return sign({
    auth_date: String(Math.floor(at.getTime() / 1000)),
    query_id: "AAE",
    user: JSON.stringify({ id: telegramUserId, first_name: "U", language_code: "en" }),
    start_param: startParam,
  });
}

const page = () => `p_${encodeLinkCode(MAYA)}`;
const viewer = (id: number) => ({ id, firstName: "U", languageCode: "en" });

function block(id: number, type: string, config: Record<string, unknown>, order = id) {
  fake.db.table("block").push({ id, user_id: MAYA, type, order, clicks: 0, config });
}

beforeEach(() => {
  fake.db.reset();
  shared.prepared = [];
  seedPeople(fake.db);
  fake.db.table("user").find((u: any) => u.id === MAYA).description = "Songs and studio notes.";
  fake.db.table("user").find((u: any) => u.id === MAYA).show_follower_count = true;
  linkTelegram(fake.db, JORDAN, JORDAN_TG);
  Object.assign(env, {
    TELEGRAM_ENABLED: true,
    TELEGRAM_GROUPS: true,
    TELEGRAM_MINIAPP: true,
    TELEGRAM_BOT_TOKEN: TOKEN,
    MESSAGING_INVITE_ONLY: false,
  });
});

describe("launch data", () => {
  it("accepts data Telegram signed and reads the user and start param", () => {
    const result = validateInitData(launch(JORDAN_TG, page()), NOW);
    expect(result).toMatchObject({ ok: true, user: { id: JORDAN_TG }, startParam: page() });
  });

  it("refuses a changed field, another bot's signature, stale data and a missing user", () => {
    const signed = launch(JORDAN_TG, page());
    expect(validateInitData(signed.replace("start_param=p_", "start_param=q_"), NOW)).toEqual({
      ok: false,
      reason: "bad_hash",
    });
    const other = sign({ auth_date: String(NOW.getTime() / 1000), user: '{"id":1}' }, "999:x");
    expect(validateInitData(other, NOW)).toMatchObject({ ok: false, reason: "bad_hash" });
    const old = launch(JORDAN_TG, page(), new Date(NOW.getTime() - 2 * 60 * 60 * 1000));
    expect(validateInitData(old, NOW)).toMatchObject({ ok: false, reason: "expired" });
    const noUser = sign({ auth_date: String(NOW.getTime() / 1000) });
    expect(validateInitData(noUser, NOW)).toMatchObject({ ok: false, reason: "no_user" });
    expect(validateInitData("", NOW)).toMatchObject({ ok: false, reason: "missing" });
  });
});

describe("the page under the allow list (acceptance 15)", () => {
  it("leaves out pool, referral, RNS and crypto blocks, and any block that names a stake", async () => {
    block(1, "link", { platform: "youtube", url: "https://youtube.com/@maya", label: "YouTube" });
    block(2, "pool", { address: "0xpool" });
    block(3, "referral", {});
    block(4, "rnsid", { show: {} });
    block(5, "media", { platform: "creator-pool", url: "https://amped.bio/i/pools/0x1" });
    block(6, "media", { platform: "token-price", url: "x" });
    block(7, "link", { platform: "custom", url: "https://opensea.io/maya", label: "My art" });
    block(8, "text", { platform: "custom", url: "", label: "Stake in my pool" });
    block(9, "media", { platform: "spotify", url: "https://open.spotify.com/artist/1" });
    const result = await buildMiniAppPage(viewer(JORDAN_TG), page());
    expect(result.blocks.map(b => b.id)).toEqual([1, 9]);
    expect(result.skipped).toBe(true);
    expect(result.creator).toMatchObject({ name: "Maya Lin", handle: "maya" });
  });

  it("never renders an 18+ block, and keeps Made with Amped.Bio linked when nothing was left out", async () => {
    block(1, "link", { platform: "youtube", url: "https://youtube.com/@maya", label: "YouTube" });
    block(2, "media", { platform: "youtube", url: "https://youtube.com/x", adult: true });
    const result = await buildMiniAppPage(viewer(JORDAN_TG), page());
    expect(result.blocks.map(b => b.id)).toEqual([1]);
    expect(result.skipped).toBe(true);
    fake.db.table("block").splice(1, 1);
    expect((await buildMiniAppPage(viewer(JORDAN_TG), page())).skipped).toBe(false);
  });

  it("hides a bio that names a non TON asset", async () => {
    fake.db.table("user").find((u: any) => u.id === MAYA).description = "Back my REVO pool";
    const result = await buildMiniAppPage(viewer(JORDAN_TG), page());
    expect(result.creator.bio).toBe("");
    expect(result.skipped).toBe(true);
  });

  it("puts Message on the MainButton only while Fan messages is open", async () => {
    block(1, "telegram_message", { label: "Message me on Telegram" });
    expect((await buildMiniAppPage(viewer(JORDAN_TG), page())).messageLink).toBeNull();
    openMessages(fake.db, MAYA);
    expect((await buildMiniAppPage(viewer(JORDAN_TG), page())).messageLink).toBe(
      `https://t.me/AmpedBioStagingBot?start=m_${encodeLinkCode(MAYA)}`
    );
  });

  it("shows Join group for an open group, and for a gated one only to a viewer who qualifies (tg-miniapp-gated-join)", async () => {
    block(1, "telegram_group", { label: "Join my Telegram group" });
    const group = {
      id: Buffer.alloc(16, 7),
      creatorUserId: MAYA,
      tgChatId: BigInt(-100),
      title: "Studio",
      ruleKind: "FOLLOWER",
      stakeMin: null,
      inviteLink: "https://t.me/+x",
      botIsAdmin: true,
      connectedAt: new Date(),
      disconnectedAt: null,
    };
    fake.db.table("telegramGroup").push(group);
    const open = await buildMiniAppPage(viewer(JORDAN_TG), page());
    expect(open.blocks).toEqual([
      {
        id: 1,
        kind: "join_group",
        link: `https://t.me/AmpedBioStagingBot?start=j_${encodeLinkCode(MAYA)}`,
        rule: "Followers and members",
      },
    ]);
    group.ruleKind = "POOL_MEMBER";
    expect((await buildMiniAppPage(viewer(JORDAN_TG), page())).blocks).toEqual([]);
    fake.db.stakes.push({ poolId: 70, userId: JORDAN, amount: 5n });
    expect((await buildMiniAppPage(viewer(JORDAN_TG), page())).blocks[0]).toMatchObject({
      kind: "join_group",
      rule: null,
    });
  });

  it("sends nothing that names a pool, a stake, a wallet or a return", async () => {
    block(1, "link", { platform: "youtube", url: "https://youtube.com/@maya", label: "YouTube" });
    block(2, "pool", { address: "0xpool" });
    block(3, "followers", { title: "Fans" });
    block(4, "follow", { label: "Follow" });
    block(5, "telegram_message", { label: "Message me" });
    openMessages(fake.db, MAYA);
    const json = JSON.stringify(await buildMiniAppPage(viewer(JORDAN_TG), page()));
    expect(json).not.toMatch(/\b(pool|stake|staking|revo|trevo|apy|apr|yield|wallet|usdc)\b/i);
  });

  it("refuses an unknown code, an unpublished page and the flag off", async () => {
    await expect(buildMiniAppPage(viewer(JORDAN_TG), "p_zzzzzzzzzz")).rejects.toMatchObject({
      code: "not_found",
    });
    fake.db.table("user").find((u: any) => u.id === MAYA).page_status = "UNPUBLISHED";
    await expect(buildMiniAppPage(viewer(JORDAN_TG), page())).rejects.toBeInstanceOf(MiniAppError);
    fake.db.table("user").find((u: any) => u.id === MAYA).page_status = "PUBLISHED";
    env.TELEGRAM_MINIAPP = false;
    await expect(buildMiniAppPage(viewer(JORDAN_TG), page())).rejects.toMatchObject({
      code: "off",
    });
  });

  it("gives the viewer's own code to the share link", async () => {
    const result = await buildMiniAppPage(viewer(JORDAN_TG), page());
    expect(result.shareLink).toBe(
      `https://t.me/AmpedBioStagingBot/bio?startapp=p_${encodeLinkCode(MAYA)}_${encodeLinkCode(JORDAN)}`
    );
    expect(result.viewer).toEqual({ linked: true, following: false });
    expect((await buildMiniAppPage(viewer(STRANGER_TG), page())).viewer.linked).toBe(false);
  });
});

describe("follow and share from the Mini App", () => {
  it("a linked viewer follows once; an unlinked one is asked to link", async () => {
    await miniAppFollow(viewer(JORDAN_TG), page());
    await miniAppFollow(viewer(JORDAN_TG), page());
    expect(fake.db.table("follow")).toHaveLength(1);
    expect(fake.db.table("follow")[0]).toMatchObject({ follower_id: JORDAN, source: "telegram" });
    expect((await buildMiniAppPage(viewer(JORDAN_TG), page())).viewer.following).toBe(true);
    await expect(miniAppFollow(viewer(STRANGER_TG), page())).rejects.toMatchObject({
      code: "not_linked",
    });
  });

  it("refuses a creator who blocked the viewer", async () => {
    fake.db.table("followBlock").push({ creator_id: MAYA, user_id: JORDAN });
    await expect(miniAppFollow(viewer(JORDAN_TG), page())).rejects.toMatchObject({
      code: "blocked",
    });
    follow(fake.db, ANA, MAYA);
  });

  it("prepares the creator card for shareMessage", async () => {
    const result = await prepareMiniAppShare(viewer(JORDAN_TG), page());
    expect(result.id).toBe("prep1");
    const [call] = shared.prepared;
    expect(call.userId).toBe(JORDAN_TG);
    expect(call.result.title).toBe("Maya Lin");
    expect(call.result.reply_markup.inline_keyboard.flat().map((b: any) => b.text)).toEqual([
      "Open page",
    ]);
  });
});
