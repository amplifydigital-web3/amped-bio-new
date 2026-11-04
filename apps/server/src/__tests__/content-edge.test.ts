/**
 * Content takedown C7a (Build Board #20 and #28): the edge state rule, the outbox
 * sync, backoff, alerts, bulk writes, Stream origins and the Safety helpers.
 * Spec: docs/features/content-takedown.md section 6. Gateway checks live in
 * apps/media-gateway/test/gateway.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const items: Row[] = [];
  const same = (a: any, b: any) => {
    if (a instanceof Uint8Array && b instanceof Uint8Array) {
      return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
    }
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    return a === b;
  };
  const matches = (row: Row, where: Row = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (
        value &&
        typeof value === "object" &&
        !(value instanceof Uint8Array) &&
        !(value instanceof Date)
      ) {
        if ("in" in value) return value.in.some((v: any) => same(row[key], v));
        if ("not" in value) return !same(row[key] ?? null, value.not);
        if ("gte" in value) return row[key] >= value.gte;
      }
      return same(row[key] ?? null, value);
    });
  const apply = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in (value as Row)) {
        row[key] = (row[key] ?? 0) + (value as Row).increment;
      } else {
        row[key] = value;
      }
    }
    row.updatedAt = new Date(Date.now());
  };
  const sorted = (rows: Row[], orderBy?: Row) =>
    orderBy?.edgeDirtyAt
      ? [...rows].sort((a, b) => a.edgeDirtyAt.getTime() - b.edgeDirtyAt.getTime())
      : rows;
  const prisma: any = {
    contentItem: {
      findMany: vi.fn(async ({ where, orderBy, take }: any) =>
        sorted(
          items.filter(row => matches(row, where)),
          orderBy
        )
          .slice(0, take ?? Infinity)
          .map(row => ({ ...row }))
      ),
      findFirst: vi.fn(
        async ({ where, orderBy }: any) =>
          sorted(
            items.filter(row => matches(row, where)),
            orderBy
          )[0] ?? null
      ),
      findUnique: vi.fn(async ({ where }: any) => items.find(row => matches(row, where)) ?? null),
      count: vi.fn(async ({ where }: any) => items.filter(row => matches(row, where)).length),
      update: vi.fn(async ({ where, data }: any) => {
        const row = items.find(item => matches(item, where))!;
        apply(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = items.filter(item => matches(item, where));
        rows.forEach(row => apply(row, data));
        return { count: rows.length };
      }),
    },
  };
  return { prisma, items };
});

const edge = vi.hoisted(() => ({
  configured: true,
  kv: new Map<string, string>(),
  putTakedownKey: vi.fn(),
  deleteTakedownKey: vi.fn(),
  putTakedownKeys: vi.fn(),
  deleteTakedownKeys: vi.fn(),
  setStreamAllowedOrigins: vi.fn(async (_uid: string, _origins: string[]) => {}),
  purgeGatewayUrls: vi.fn(async (_urls: string[]) => {}),
}));

vi.mock("@repo/database", () => ({ prisma: db.prisma }));
vi.mock("../env", () => ({ env: { CF_STREAM_API_TOKEN: "stream-token" } }));
vi.mock("../services/cloudflare/kv", () => ({
  takedownKvConfigured: () => edge.configured,
  putTakedownKey: edge.putTakedownKey,
  deleteTakedownKey: edge.deleteTakedownKey,
  putTakedownKeys: edge.putTakedownKeys,
  deleteTakedownKeys: edge.deleteTakedownKeys,
}));
vi.mock("../services/cloudflare/stream", () => ({
  STREAM_CLOSED_ORIGINS: ["takedown.invalid"],
  setStreamAllowedOrigins: edge.setStreamAllowedOrigins,
}));
vi.mock("../services/cloudflare/config", () => ({
  streamAllowedOrigins: () => ["amped.bio", "*.amped.bio"],
}));
vi.mock("../services/cloudflare/cachePurge", () => ({
  gatewayCacheUrl: (key: string) => `https://media.example/${key}`,
  purgeGatewayUrls: edge.purgeGatewayUrls,
}));

import {
  desiredEdgeState,
  edgeBackoffMs,
  edgeHealth,
  edgeStatus,
  hideCreator,
  hideItems,
  reconcileEdge,
  resetEdgeSyncForTests,
  restoreItems,
  runEdgeSync,
  syncEdge,
  EDGE_BULK_THRESHOLD,
} from "../services/content/edge";

const NOW = new Date("2026-11-04T12:00:00Z");
let seq = 0;

const PUBLIC_ITEM = {
  status: "READY",
  publishState: "PUBLISHED",
  moderationState: "CLEAR",
  moderationReason: null,
  accessRuleId: null,
  adult: false,
  deletedAt: null,
  hiddenAt: null,
  hiddenReason: null,
};
const LIVE = { page_status: "PUBLISHED", block: "no" };

function seed(overrides: Record<string, unknown> = {}) {
  seq += 1;
  const row = {
    id: Uint8Array.from([seq, ...Array(15).fill(0)]),
    publicId: `item${String(seq).padStart(12, "0")}`,
    userId: 7,
    ...PUBLIC_ITEM,
    edgeState: "OPEN",
    edgeDirtyAt: NOW,
    edgeAttempts: 0,
    edgeError: null,
    updatedAt: NOW,
    user: { ...LIVE },
    assets: [] as Array<Record<string, unknown>>,
    ...overrides,
  };
  db.items.push(row);
  return row;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  db.items.length = 0;
  edge.configured = true;
  edge.kv.clear();
  resetEdgeSyncForTests();
  edge.putTakedownKey.mockReset().mockImplementation(async (key: string, value: string) => {
    edge.kv.set(key, value);
  });
  edge.deleteTakedownKey.mockReset().mockImplementation(async (key: string) => {
    edge.kv.delete(key);
  });
  edge.putTakedownKeys.mockReset().mockImplementation(async (pairs: any[]) => {
    pairs.forEach(pair => edge.kv.set(pair.key, pair.value));
  });
  edge.deleteTakedownKeys.mockReset().mockImplementation(async (keys: string[]) => {
    keys.forEach(key => edge.kv.delete(key));
  });
  edge.setStreamAllowedOrigins.mockClear();
  edge.purgeGatewayUrls.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("desiredEdgeState (4.1)", () => {
  it("is OPEN only for a public item of a live creator", () => {
    expect(desiredEdgeState(PUBLIC_ITEM, LIVE)).toEqual({ state: "OPEN" });
  });

  it.each([
    ["a draft", { publishState: "DRAFT" }],
    ["an archived item", { publishState: "ARCHIVED" }],
    ["a held item", { moderationState: "HELD" }],
    ["a pending item", { moderationState: "PENDING" }],
    ["a processing item", { status: "PROCESSING" }],
    ["a gated item", { accessRuleId: new Uint8Array(16) }],
    ["an 18+ item", { adult: true }],
  ])("is PRIVATE for %s", (_name, overrides) => {
    expect(desiredEdgeState({ ...PUBLIC_ITEM, ...overrides } as never, LIVE)).toEqual({
      state: "PRIVATE",
    });
  });

  it("is PRIVATE when the creator's page is unpublished", () => {
    expect(desiredEdgeState(PUBLIC_ITEM, { page_status: "UNPUBLISHED", block: "no" })).toEqual({
      state: "PRIVATE",
    });
  });

  it.each([
    ["deleted", { status: "DELETED", deletedAt: NOW }, LIVE],
    [
      "moderation",
      { status: "BLOCKED", moderationState: "BLOCKED", moderationReason: "blocklist:malware" },
      LIVE,
    ],
    ["child_safety", { moderationState: "BLOCKED", moderationReason: "csam_match" }, LIVE],
    ["suspended", {}, { page_status: "PUBLISHED", block: "yes" }],
    ["safety", { hiddenAt: NOW, hiddenReason: "safety" }, LIVE],
    ["child_safety", { hiddenAt: NOW, hiddenReason: "child_safety" }, LIVE],
  ])("is BLOCKED with reason %s", (reason, overrides, creator) => {
    expect(desiredEdgeState({ ...PUBLIC_ITEM, ...overrides } as never, creator)).toEqual({
      state: "BLOCKED",
      reason,
    });
  });

  it("puts BLOCKED over PRIVATE", () => {
    const draftDeleted = {
      ...PUBLIC_ITEM,
      publishState: "DRAFT",
      status: "DELETED",
      deletedAt: NOW,
    };
    expect(desiredEdgeState(draftDeleted, { page_status: "UNPUBLISHED", block: "no" }).state).toBe(
      "BLOCKED"
    );
    const gatedHidden = {
      ...PUBLIC_ITEM,
      accessRuleId: new Uint8Array(16),
      hiddenAt: NOW,
      hiddenReason: "safety",
    };
    expect(desiredEdgeState(gatedHidden as never, LIVE).state).toBe("BLOCKED");
  });

  it("blocks an item with no creator row", () => {
    expect(desiredEdgeState(PUBLIC_ITEM, null)).toEqual({ state: "BLOCKED", reason: "suspended" });
  });
});

describe("syncEdge (4.3 to 4.5)", () => {
  it("writes the blocked key, closes Stream, purges and clears the mark", async () => {
    const item = seed({
      status: "DELETED",
      deletedAt: NOW,
      assets: [
        { role: "ORIGINAL", storage: "STREAM", r2Key: null, streamUid: "v1" },
        { role: "POSTER", storage: "R2", r2Key: "c/x/poster.jpg", streamUid: null },
      ],
    });
    const result = await syncEdge([item.publicId]);
    expect(result).toEqual({ applied: 1, unchanged: 0, failed: 0 });
    expect(JSON.parse(edge.kv.get(`blocked:${item.publicId}`)!)).toEqual({
      r: "deleted",
      at: NOW.toISOString(),
    });
    expect(edge.setStreamAllowedOrigins).toHaveBeenCalledWith("v1", ["takedown.invalid"]);
    expect(edge.purgeGatewayUrls).toHaveBeenCalledWith(["https://media.example/c/x/poster.jpg"]);
    expect(item).toMatchObject({ edgeState: "BLOCKED", edgeDirtyAt: null, edgeAttempts: 0 });
  });

  it("writes the private key for an unpublished item and leaves Stream alone", async () => {
    const item = seed({
      publishState: "DRAFT",
      assets: [{ role: "ORIGINAL", storage: "STREAM", r2Key: null, streamUid: "v1" }],
    });
    await syncEdge([item.publicId]);
    expect(edge.kv.has(`private:${item.publicId}`)).toBe(true);
    expect(edge.setStreamAllowedOrigins).not.toHaveBeenCalled();
    expect(item.edgeState).toBe("PRIVATE");
  });

  it("opens a published item: both keys gone, normal Stream origins back after a block", async () => {
    const item = seed({
      edgeState: "BLOCKED",
      assets: [{ role: "ORIGINAL", storage: "STREAM", r2Key: null, streamUid: "v1" }],
    });
    edge.kv.set(`blocked:${item.publicId}`, "{}");
    await syncEdge([item.publicId]);
    expect(edge.kv.size).toBe(0);
    expect(edge.setStreamAllowedOrigins).toHaveBeenCalledWith("v1", ["amped.bio", "*.amped.bio"]);
    expect(item.edgeState).toBe("OPEN");
  });

  it("clears an unchanged state without a write", async () => {
    const item = seed({ edgeState: "OPEN" });
    expect(await syncEdge([item.publicId])).toEqual({ applied: 0, unchanged: 1, failed: 0 });
    expect(edge.putTakedownKey).not.toHaveBeenCalled();
    expect(edge.deleteTakedownKey).not.toHaveBeenCalled();
    expect(item.edgeDirtyAt).toBeNull();
  });

  it("rewrites a BLOCKED key so a reason change reaches the edge", async () => {
    const item = seed({ edgeState: "BLOCKED", hiddenAt: NOW, hiddenReason: "child_safety" });
    await syncEdge([item.publicId]);
    expect(JSON.parse(edge.kv.get(`blocked:${item.publicId}`)!).r).toBe("child_safety");
  });

  it("keeps the item dirty when KV fails, counts the attempt and never logs a key value", async () => {
    const item = seed({ status: "DELETED", deletedAt: NOW });
    edge.putTakedownKey.mockRejectedValueOnce(
      new Error("KV write failed 500 https://api.cloudflare.com/client/v4/secret")
    );
    const result = await syncEdge([item.publicId]);
    expect(result.failed).toBe(1);
    expect(item.edgeDirtyAt).not.toBeNull();
    expect(item.edgeAttempts).toBe(1);
    expect(item.edgeError).toContain("[url]");
    expect(item.edgeError).not.toContain("cloudflare.com");
  });

  it("keeps the mark when the item was marked again during the write", async () => {
    const item = seed({ status: "DELETED", deletedAt: NOW });
    edge.putTakedownKey.mockImplementationOnce(async () => {
      item.edgeDirtyAt = new Date(NOW.getTime() + 1000);
    });
    await syncEdge([item.publicId]);
    expect(item.edgeState).toBe("BLOCKED");
    expect(item.edgeDirtyAt).not.toBeNull();
  });

  it("uses the bulk endpoints above 20 items", async () => {
    const ids = Array.from(
      { length: EDGE_BULK_THRESHOLD + 1 },
      () => seed({ status: "DELETED", deletedAt: NOW }).publicId
    );
    await syncEdge(ids);
    expect(edge.putTakedownKeys).toHaveBeenCalledTimes(1);
    expect(edge.putTakedownKeys.mock.calls[0]![0]).toHaveLength(EDGE_BULK_THRESHOLD + 1);
    expect(edge.putTakedownKey).not.toHaveBeenCalled();
  });

  it("coalesces repeated marks into one write", async () => {
    const item = seed({ status: "DELETED", deletedAt: NOW });
    await syncEdge([item.publicId, item.publicId, item.publicId]);
    expect(edge.putTakedownKey).toHaveBeenCalledTimes(1);
  });
});

describe("runEdgeSync loop", () => {
  it("backs off after a failure: 1, 2, 5, 10, then 15 minutes", async () => {
    expect([1, 2, 3, 4, 5, 9].map(edgeBackoffMs)).toEqual(
      [1, 2, 5, 10, 15, 15].map(m => m * 60_000)
    );
    const item = seed({ status: "DELETED", deletedAt: NOW, edgeAttempts: 2, updatedAt: NOW });
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    await runEdgeSync(new Date());
    expect(edge.putTakedownKey).not.toHaveBeenCalled();
    vi.setSystemTime(new Date(NOW.getTime() + 2 * 60_000));
    await runEdgeSync(new Date());
    expect(edge.putTakedownKey).toHaveBeenCalledTimes(1);
    expect(item.edgeDirtyAt).toBeNull();
  });

  it("alerts when an item has waited more than 10 minutes", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    seed({ status: "DELETED", deletedAt: NOW, edgeAttempts: 4, updatedAt: new Date() });
    edge.putTakedownKey.mockRejectedValue(new Error("KV write failed 503"));
    await runEdgeSync(new Date(NOW.getTime() + 11 * 60_000));
    const lines = error.mock.calls.map(call => String(call[0]));
    expect(lines).toContain("[content] ALERT edge sync behind");
    expect(JSON.stringify(error.mock.calls)).not.toContain("item0");
  });

  it("alerts when 10 items have failed 5 times", async () => {
    for (let i = 0; i < 10; i += 1) {
      seed({ status: "DELETED", deletedAt: NOW, edgeAttempts: 5, updatedAt: new Date() });
    }
    const health = await edgeHealth();
    expect(health).toMatchObject({ state: "behind", waiting: 10, failures: 10 });
  });

  it("not configured: marks nothing synced and logs the alert", async () => {
    edge.configured = false;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const item = seed({ status: "DELETED", deletedAt: NOW });
    expect(await runEdgeSync()).toEqual({ applied: 0, unchanged: 0, failed: 0 });
    expect(await syncEdge([item.publicId])).toEqual({ applied: 0, unchanged: 0, failed: 0 });
    expect(item.edgeDirtyAt).not.toBeNull();
    expect(error).toHaveBeenCalledWith("[content] ALERT edge sync not configured");
    expect((await edgeHealth()).state).toBe("not_configured");
  });

  it("reconcile marks drifted items and leaves matching ones", async () => {
    const drifted = seed({
      status: "DELETED",
      deletedAt: NOW,
      edgeState: "OPEN",
      edgeDirtyAt: null,
    });
    const fine = seed({ edgeState: "OPEN", edgeDirtyAt: null });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await reconcileEdge()).toBe(1);
    expect(drifted.edgeDirtyAt).not.toBeNull();
    expect(fine.edgeDirtyAt).toBeNull();
  });
});

describe("Safety helpers (4.6)", () => {
  it("hideItems blocks at once, closes Stream, and restoreItems reopens to the computed state", async () => {
    const item = seed({
      edgeDirtyAt: null,
      assets: [{ role: "ORIGINAL", storage: "STREAM", r2Key: null, streamUid: "v9" }],
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const hidden = await hideItems([item.publicId], "safety");
    expect(hidden).toEqual({ synced: [item.publicId], pending: [] });
    expect(JSON.parse(edge.kv.get(`blocked:${item.publicId}`)!).r).toBe("safety");
    expect(edge.setStreamAllowedOrigins).toHaveBeenLastCalledWith("v9", ["takedown.invalid"]);
    expect(edge.purgeGatewayUrls).not.toHaveBeenCalled();

    const restored = await restoreItems([item.publicId]);
    expect(restored.synced).toEqual([item.publicId]);
    expect(edge.kv.size).toBe(0);
    expect(edge.setStreamAllowedOrigins).toHaveBeenLastCalledWith("v9", [
      "amped.bio",
      "*.amped.bio",
    ]);
    expect(item).toMatchObject({ hiddenAt: null, edgeState: "OPEN" });
  });

  it("hideItems reports pending when Cloudflare fails", async () => {
    const item = seed({ edgeDirtyAt: null });
    edge.putTakedownKey.mockRejectedValueOnce(new Error("429"));
    expect(await hideItems([item.publicId], "safety")).toEqual({
      synced: [],
      pending: [item.publicId],
    });
    expect(await edgeStatus(item.publicId)).toMatchObject({ state: "OPEN", attempts: 1 });
  });

  it("hideCreator blocks every item of a suspended creator and reinstating reopens them", async () => {
    const a = seed({ edgeDirtyAt: null, user: { page_status: "PUBLISHED", block: "yes" } });
    const b = seed({ edgeDirtyAt: null, user: { page_status: "PUBLISHED", block: "yes" } });
    seed({ userId: 8, edgeDirtyAt: null });
    vi.spyOn(console, "info").mockImplementation(() => {});
    await hideCreator(7);
    expect(a.edgeState).toBe("BLOCKED");
    expect(b.edgeState).toBe("BLOCKED");
    expect(JSON.parse(edge.kv.get(`blocked:${a.publicId}`)!).r).toBe("suspended");
    expect(edge.kv.size).toBe(2);

    a.user.block = "no";
    b.user.block = "no";
    await hideCreator(7);
    expect(edge.kv.size).toBe(0);
    expect(a.edgeState).toBe("OPEN");
  });
});
