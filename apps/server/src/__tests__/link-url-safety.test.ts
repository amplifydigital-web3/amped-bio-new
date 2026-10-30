/**
 * Build Board D57: link URLs that run script. The blocks router refuses them on
 * every save path, public reads drop any stored before the fix, and the
 * blocks:unsafe-urls scan finds and neutralizes them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    block: { findFirst: fn(), findUnique: fn(), create: fn(), update: fn() },
    $transaction: fn(),
  };
});
vi.mock("@repo/database", () => ({ prisma: db }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));

import { blocksRouter } from "../trpc/blocks";
import { sanitizeBlockConfig } from "../utils/sanitizeBlockConfig";
import { neutralizedConfig, unsafeBlockField } from "../utils/unsafeBlockUrls";

const caller = blocksRouter.createCaller({ user: { sub: 42 } } as never);

const PAYLOADS = [
  "javascript:alert(document.cookie)",
  "JavaScript:alert(1)",
  "java\tscript:alert(1)",
  " javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
];

const link = (url: string) => ({ platform: "custom", url, label: "Shop" });

beforeEach(() => {
  vi.clearAllMocks();
  db.block.findUnique.mockResolvedValue({ id: 7, user_id: 42 });
  db.block.update.mockImplementation(async ({ data }) => ({ id: 7, ...data }));
  db.block.create.mockImplementation(async ({ data }) => ({ id: 8, ...data }));
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe("save paths refuse script links", () => {
  it.each(PAYLOADS)("editBlock refuses %j", async url => {
    await expect(
      caller.editBlock({ id: 7, type: "link", order: 0, config: link(url) })
    ).rejects.toThrow();
    expect(db.block.update).not.toHaveBeenCalled();
    expect(db.block.create).not.toHaveBeenCalled();
  });

  it.each(PAYLOADS)("editBlocks refuses %j", async url => {
    await expect(
      caller.editBlocks({ blocks: [{ id: 7, type: "link", order: 0, config: link(url) }] })
    ).rejects.toThrow();
    expect(db.block.update).not.toHaveBeenCalled();
  });

  it.each(PAYLOADS)("addBlock refuses %j", async url => {
    await expect(caller.addBlock({ type: "link", order: 0, config: link(url) })).rejects.toThrow();
    expect(db.block.create).not.toHaveBeenCalled();
  });

  it("refuses a script URL on a media block", async () => {
    await expect(
      caller.addBlock({
        type: "media",
        order: 0,
        config: { platform: "youtube", url: "javascript:alert(1)", label: "" },
      })
    ).rejects.toThrow();
  });

  it("editBlock now checks the config against the block type", async () => {
    await expect(
      caller.editBlock({ id: 7, type: "link", order: 0, config: { url: "https://a.example" } })
    ).rejects.toThrow();
  });

  it("still saves the links the editor writes", async () => {
    for (const url of ["https://robfrasca.com", "mailto:rob@example.com", "tel:+15551234567"]) {
      await caller.editBlock({ id: 7, type: "link", order: 0, config: link(url) });
    }
    expect(db.block.update).toHaveBeenCalledTimes(3);
    expect(db.block.update.mock.calls[0]![0].data.config.url).toBe("https://robfrasca.com");
  });

  it("saves a page that holds a block neutralized by the scan", async () => {
    const neutralized = neutralizedConfig(link("javascript:alert(1)"), "url");
    await caller.editBlocks({
      blocks: [
        { id: 7, type: "link", order: 0, config: neutralized },
        { id: 9, type: "link", order: 1, config: link("https://a.example") },
      ],
    });
    expect(db.block.update).toHaveBeenCalledTimes(2);
  });
});

describe("public reads drop stored script links", () => {
  it.each(PAYLOADS)("empties a link block URL %j", url => {
    expect(sanitizeBlockConfig("link", link(url))).toEqual({ ...link(""), url: "" });
  });

  it("empties a media URL that is not http or https", () => {
    const config = { platform: "youtube", url: "mailto:a@b.co", label: "" };
    expect(sanitizeBlockConfig("media", config)).toEqual({ ...config, url: "" });
  });

  it("empties a legacy Telegram text block that is not an https link", () => {
    const config = { platform: "telegram", content: "javascript:alert(1)" };
    expect(sanitizeBlockConfig("text", config)).toEqual({ platform: "telegram", content: "" });
    const ok = { platform: "telegram", content: "https://t.me/amped" };
    expect(sanitizeBlockConfig("text", ok)).toBe(ok);
  });

  it("returns a safe config unchanged", () => {
    const config = link("https://robfrasca.com");
    expect(sanitizeBlockConfig("link", config)).toBe(config);
  });
});

describe("blocks:unsafe-urls scan", () => {
  const row = (type: string, config: unknown) => ({ id: 1, user_id: 2, type, config });

  it("finds unsafe link, media and Telegram text URLs", () => {
    expect(unsafeBlockField(row("link", link("javascript:alert(1)")))).toEqual({
      field: "url",
      value: "javascript:alert(1)",
    });
    expect(
      unsafeBlockField(row("media", { platform: "youtube", url: "data:x", label: "" }))?.field
    ).toBe("url");
    expect(
      unsafeBlockField(row("text", { platform: "telegram", content: "http://t.me/x" }))?.field
    ).toBe("content");
  });

  it("leaves safe, empty and unrelated blocks alone", () => {
    expect(unsafeBlockField(row("link", link("https://a.example")))).toBeNull();
    expect(unsafeBlockField(row("link", link("")))).toBeNull();
    expect(
      unsafeBlockField(row("text", { platform: "text", content: "<p>javascript:</p>" }))
    ).toBeNull();
    expect(unsafeBlockField(row("pool", { address: "0xabc", label: "Pool" }))).toBeNull();
    expect(unsafeBlockField(row("link", null))).toBeNull();
  });

  it("neutralizes by emptying the field and hiding the block", () => {
    expect(neutralizedConfig(link("javascript:alert(1)"), "url")).toEqual({
      ...link(""),
      hidden: true,
    });
  });
});
