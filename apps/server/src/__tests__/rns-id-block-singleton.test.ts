/**
 * The RNS ID block (Screen Review 112) is one per page. SINGLETON_BLOCK_TYPES
 * gates addBlock on the server and the Add block dialog on the client, and
 * rnsIdBlockOptions reads the first matching row (services/rnsIdentity.ts).
 * This test pins the server invariant, so the "first match is the block" rule
 * can never be surprised by a second rnsid row on one page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    block: { findFirst: fn(), create: fn(), findMany: fn(), update: fn(), delete: fn() },
    $transaction: fn(),
  };
});

vi.mock("@repo/database", () => ({ prisma: db }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));

import { blocksRouter } from "../trpc/blocks";

const caller = blocksRouter.createCaller({ user: { sub: 42 } } as never);

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof db) => unknown)(db) : Promise.all(arg as [])
  );
});

describe("RNS ID block singleton invariant", () => {
  it("refuses a second rnsid block on the same page", async () => {
    db.block.findFirst.mockResolvedValue({ id: 1, user_id: 42, type: "rnsid" });
    await expect(caller.addBlock({ type: "rnsid", config: {} })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "This block is already on your page",
    });
    expect(db.block.create).not.toHaveBeenCalled();
  });

  it("creates the first rnsid block with the sanitized default config", async () => {
    db.block.findFirst.mockResolvedValue(null);
    db.block.create.mockResolvedValue({ id: 7, type: "rnsid" });
    await caller.addBlock({ type: "rnsid", config: {} });
    expect(db.block.create).toHaveBeenCalledTimes(1);
    const data = db.block.create.mock.calls[0][0].data;
    expect(data.type).toBe("rnsid");
    // sanitizeBlockConfig filled the defaults, so rnsIdBlockOptions reads a
    // well formed switch set even when the editor sent an empty config
    expect(data.config).toMatchObject({ show: { nameOnId: false } });
  });

  it("keeps gating the other singleton types the same way", async () => {
    db.block.findFirst.mockResolvedValue({ id: 2, type: "follow" });
    await expect(caller.addBlock({ type: "follow", config: {} })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
