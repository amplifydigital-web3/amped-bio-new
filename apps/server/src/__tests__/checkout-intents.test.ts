/**
 * Checkout intents (Build Board #49 Mobile checkout, PR CK-1). The database is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: Buffer;
  kind: string;
  targetType: string;
  targetId: string;
  creatorUserId: number;
  userId: number | null;
  claimedAt: Date | null;
  status: string;
  via: string | null;
  source: string;
  expiresAt: Date;
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  item: null as unknown,
  rows: [] as Row[],
}));

const sellable = () => ({
  title: "Episode 4",
  status: "READY",
  publishState: "PUBLISHED",
  moderationState: "CLEAR",
  adult: false,
  deletedAt: null,
  user: { id: 10, handle: "maya", name: "Maya", block: "no", page_status: "PUBLISHED" },
});

vi.mock("@repo/database", () => ({
  prisma: {
    contentItem: { findUnique: vi.fn(async () => state.item) },
    checkoutIntent: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        state.rows.push({ ...data, createdAt: new Date() });
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: Buffer } }) =>
          state.rows.find(r => r.id.equals(where.id)) ?? null
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { userId: number; status: { in: string[] }; expiresAt: { gt: Date } };
        }) =>
          state.rows
            .filter(
              r =>
                r.userId === where.userId &&
                where.status.in.includes(r.status) &&
                r.expiresAt > where.expiresAt.gt
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
      ),
      update: vi.fn(async ({ where, data }: { where: { id: Buffer }; data: Partial<Row> }) => {
        const row = state.rows.find(r => r.id.equals(where.id));
        if (row) Object.assign(row, data);
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: Buffer; userId: null }; data: Partial<Row> }) => {
          const row = state.rows.find(r => r.id.equals(where.id) && r.userId === where.userId);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { expiresAt: { lt: Date }; status: { not: string } } }) => {
          const before = state.rows.length;
          state.rows = state.rows.filter(
            r => !(r.expiresAt < where.expiresAt.lt && r.status !== where.status.not)
          );
          return { count: before - state.rows.length };
        }
      ),
    },
  },
}));

import {
  effectiveStatus,
  getIntent,
  purgeEndedIntents,
  resumableIntent,
  startIntent,
} from "../services/checkout/intents";

const buy = {
  kind: "purchase" as const,
  target: { type: "content" as const, id: "abc123" },
  source: "bio" as const,
};

beforeEach(() => {
  state.item = sellable();
  state.rows = [];
});

describe("startIntent", () => {
  it("creates a 24 hour open intent and returns the pay path", async () => {
    const result = await startIntent(null, { ...buy, via: "summer" });
    expect(result.id).toMatch(/^[0-9a-f]{32}$/);
    expect(result.payPath).toBe(`/pay/${result.id}`);
    const row = state.rows[0]!;
    expect(row.status).toBe("open");
    expect(row.via).toBe("summer");
    expect(row.userId).toBeNull();
    const ttl = row.expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23.9 * 3600_000);
    expect(ttl).toBeLessThanOrEqual(24 * 3600_000);
  });

  it("refuses kinds that are not live, items not for sale, 18+ items and your own page", async () => {
    await expect(startIntent(null, { ...buy, kind: "membership" })).rejects.toThrow(
      "not available yet"
    );
    state.item = { ...sellable(), publishState: "DRAFT" };
    await expect(startIntent(null, buy)).rejects.toThrow("not for sale");
    state.item = { ...sellable(), adult: true };
    await expect(startIntent(null, buy)).rejects.toThrow("not for sale");
    state.item = sellable();
    await expect(startIntent(10, buy)).rejects.toThrow("your own page");
  });
});

describe("getIntent", () => {
  it("the first signed in reader claims it; nobody else sees it", async () => {
    const { id } = await startIntent(null, buy);
    const signedOut = await getIntent(null, id);
    expect(signedOut.item?.title).toBe("Episode 4");
    expect(signedOut.signedIn).toBe(false);

    const fan = await getIntent(20, id);
    expect(fan.status).toBe("open");
    expect(state.rows[0]!.userId).toBe(20);

    await expect(getIntent(30, id)).rejects.toThrow("checkout has ended");
    // A signed out reader of a claimed intent learns nothing
    await expect(getIntent(null, id)).rejects.toThrow("checkout has ended");
  });

  it("an expired intent reads expired, is stored so, and is not claimed", async () => {
    const { id } = await startIntent(null, buy);
    state.rows[0]!.expiresAt = new Date(Date.now() - 1000);
    const result = await getIntent(20, id);
    expect(result.status).toBe("expired");
    expect(result.item).toBeNull();
    expect(state.rows[0]!.status).toBe("expired");
    expect(state.rows[0]!.userId).toBeNull();
  });

  it("an item removed after start cannot finish", async () => {
    const { id } = await startIntent(20, buy);
    state.item = { ...sellable(), deletedAt: new Date() };
    expect((await getIntent(20, id)).status).toBe("expired");
  });

  it("unknown ids are not found", async () => {
    await expect(getIntent(20, "ab".repeat(16))).rejects.toThrow("checkout has ended");
  });
});

describe("resume bar and retention", () => {
  it("offers the latest open intent of the signed in fan", async () => {
    expect(await resumableIntent(20)).toBeNull();
    await startIntent(20, buy);
    const bar = await resumableIntent(20);
    expect(bar?.title).toBe("Episode 4");
    expect(await resumableIntent(30)).toBeNull();
  });

  it("paid stays paid after expiry", () => {
    expect(effectiveStatus({ status: "paid", expiresAt: new Date(0) }, new Date())).toBe("paid");
    expect(effectiveStatus({ status: "open", expiresAt: new Date(0) }, new Date())).toBe("expired");
  });

  it("purges intents 30 days after they end, never a paid one", async () => {
    await startIntent(20, buy);
    await startIntent(20, buy);
    const old = new Date(Date.now() - 31 * 86_400_000);
    state.rows[0]!.expiresAt = old;
    state.rows[1]!.expiresAt = old;
    state.rows[1]!.status = "paid";
    expect(await purgeEndedIntents()).toBe(1);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]!.status).toBe("paid");
  });
});
