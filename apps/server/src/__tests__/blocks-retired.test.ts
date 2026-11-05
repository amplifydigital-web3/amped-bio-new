/**
 * Telegram ended (Amped Messages, PR M8). No page can add a Telegram block any more, and
 * a telegram_group row left on a page reaches its owner's editor (for the notice) but
 * never a visitor.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RETIRED_TELEGRAM_GROUP_NOTICE } from "@repo/constants";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  creatorPool: { findFirst: vi.fn() },
  theme: { findUnique: vi.fn() },
  block: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@repo/database", () => ({ prisma: db }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));
vi.mock("../trpc/trackingPixels", () => ({ getPublicTrackingPixels: vi.fn(async () => null) }));
vi.mock("../services/rnsIdentity", () => ({
  computeRnsIdentity: vi.fn(async () => ({ identity: null })),
  parseRnsDisplay: vi.fn(() => ({})),
  rnsIdBlockOptions: vi.fn(() => ({ attributes: [], visible: false })),
}));

import { blocksRouter } from "../trpc/blocks";
import handleRouter from "../trpc/handle";

const OWNER = 42;

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.block.create.mockImplementation(async ({ data }) => ({ id: 8, ...data }));
  db.theme.findUnique.mockResolvedValue({ id: 1, name: "Default", config: null });
  db.user.findFirst.mockResolvedValue({
    id: OWNER,
    handle: "maya",
    name: "Maya Lin",
    revo_name: null,
    rns_display: null,
    description: null,
    image: null,
    image_file_id: null,
    theme: 1,
    page_status: "PUBLISHED",
    block: "no",
    wallet: null,
    created_at: new Date("2026-01-01T00:00:00Z"),
  });
  db.block.findMany.mockResolvedValue([
    {
      id: 1,
      user_id: OWNER,
      type: "telegram_group",
      order: 0,
      clicks: 0,
      accessRuleId: null,
      config: { label: "Join" },
    },
    {
      id: 2,
      user_id: OWNER,
      type: "text",
      order: 1,
      clicks: 0,
      accessRuleId: null,
      config: { content: "Hi", platform: "text" },
    },
  ]);
});

describe("retired Telegram blocks", () => {
  it("refuses a new Telegram group block with the notice", async () => {
    const caller = blocksRouter.createCaller({ user: { sub: OWNER } } as never);
    await expect(
      caller.addBlock({ type: "telegram_group", order: 0, config: { label: "Join" } } as never)
    ).rejects.toThrow(RETIRED_TELEGRAM_GROUP_NOTICE);
    await expect(
      caller.addBlock({ type: "telegram_message", order: 0, config: { label: "DM" } } as never)
    ).rejects.toThrow("Add the Message me block instead.");
    expect(db.block.create).not.toHaveBeenCalled();
  });

  it("refuses a retired type through editBlock, which creates a block for an unknown id", async () => {
    const caller = blocksRouter.createCaller({ user: { sub: OWNER } } as never);
    await expect(
      caller.editBlock({ id: 999, type: "telegram_group", order: 0, config: {} } as never)
    ).rejects.toThrow(RETIRED_TELEGRAM_GROUP_NOTICE);
    await expect(
      caller.editBlock({ id: 999, type: "telegram_message", order: 0, config: {} } as never)
    ).rejects.toThrow("Add the Message me block instead.");
    expect(db.block.create).not.toHaveBeenCalled();
  });

  it("drops a telegram_group row for visitors and keeps it for the owner", async () => {
    const visitor = await handleRouter.createCaller({ user: undefined } as never).getHandle({
      handle: "maya",
    });
    expect(visitor.blocks.map(b => b.type)).toEqual(["text"]);
    const owner = await handleRouter.createCaller({ user: { sub: OWNER } } as never).getHandle({
      handle: "maya",
    });
    expect(owner.blocks.map(b => b.type)).toEqual(["telegram_group", "text"]);
  });

  it("no longer returns the Telegram doors or mark", async () => {
    const page = await handleRouter.createCaller({ user: undefined } as never).getHandle({
      handle: "maya",
    });
    expect(page.user).not.toHaveProperty("telegramMark");
    expect(page.user).not.toHaveProperty("telegramDoor");
    expect(page.user).not.toHaveProperty("telegramGroupDoor");
  });
});
