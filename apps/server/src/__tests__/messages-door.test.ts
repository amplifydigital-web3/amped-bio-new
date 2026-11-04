/**
 * Amped Messages, the Message me block (Build Board #2 r4, PR M6; spec 8.4). The door
 * on the public page, and the block config the server keeps.
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
vi.mock("../utils/cache", () => ({ getRedisClient: () => null }));
vi.mock("../services/telegram/client", () => ({
  isTelegramConfigured: () => false,
  getTelegramBot: () => null,
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: async () => null }));

import { DEFAULT_MESSAGE_BLOCK_LABEL, blockConfigSchemaFor } from "@repo/constants";
import { env } from "../env";
import { messageDoor } from "../services/messaging/messageDoor";
import { sanitizeBlockConfig } from "../utils/sanitizeBlockConfig";
import { MAYA, seedPeople } from "./helpers/messagingFixtures";

const settings = (over: Record<string, unknown>) =>
  fake.db
    .table("messagingSettings")
    .push({ userId: MAYA, ruleKind: "FOLLOWER", readReceipts: true, pausedAt: null, ...over });

beforeEach(() => {
  fake.db.reset();
  seedPeople(fake.db);
  Object.assign(env, { MESSAGING_ENABLED: true });
});

describe("messageDoor", () => {
  it("is open with the default rule when the creator never changed settings", async () => {
    expect(await messageDoor(MAYA)).toEqual({ open: true, ruleKind: "FOLLOWER" });
  });

  it("carries the rule kind and never an amount", async () => {
    settings({ ruleKind: "STAKE_MIN", stakeMin: "250" });
    const door = await messageDoor(MAYA);
    expect(door).toEqual({ open: true, ruleKind: "STAKE_MIN" });
    expect(JSON.stringify(door)).not.toContain("250");
  });

  it("is closed for No one, a pause, an unpublished or suspended page, and the kill switch", async () => {
    settings({ ruleKind: "NOBODY" });
    expect((await messageDoor(MAYA)).open).toBe(false);
    fake.db.table("messagingSettings")[0].ruleKind = "ANYONE";
    fake.db.table("messagingSettings")[0].pausedAt = new Date();
    expect((await messageDoor(MAYA)).open).toBe(false);
    fake.db.table("messagingSettings")[0].pausedAt = null;
    const user = fake.db.table("user").find((u: any) => u.id === MAYA);
    user.page_status = "UNPUBLISHED";
    expect((await messageDoor(MAYA)).open).toBe(false);
    user.page_status = "PUBLISHED";
    user.block = "yes";
    expect((await messageDoor(MAYA)).open).toBe(false);
    user.block = "no";
    Object.assign(env, { MESSAGING_ENABLED: false });
    expect((await messageDoor(MAYA)).open).toBe(false);
  });
});

describe("message block config", () => {
  it("keeps the label and hidden only, with the default for a bad label", () => {
    expect(
      sanitizeBlockConfig("message", { label: " Write to me ", rule: "x", hidden: true })
    ).toEqual({
      label: "Write to me",
      hidden: true,
    });
    expect(sanitizeBlockConfig("message", { label: "" })).toEqual({
      label: DEFAULT_MESSAGE_BLOCK_LABEL,
    });
    expect(sanitizeBlockConfig("message", { label: "x".repeat(41), hidden: true })).toEqual({
      label: DEFAULT_MESSAGE_BLOCK_LABEL,
      hidden: true,
    });
  });

  it("has its own schema", () => {
    expect(blockConfigSchemaFor("message").safeParse({}).data).toEqual({ label: "Message me" });
  });
});
