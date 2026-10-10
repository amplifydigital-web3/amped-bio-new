/**
 * Messaging on Telegram (Build Board #2), spec 3.5 and decision 13.
 * The sender loop: exclusive claims, stale resume, attempt limit, 429 pacing,
 * priority order, and the retention purge. Runs against an in-memory stand-in for
 * the two tables so the claim semantics are exercised, not mocked away.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GrammyError } from "grammy";

type Row = Record<string, any>;

const store = vi.hoisted(() => {
  const tables: Record<string, Row[]> = {
    telegramOutbox: [],
    telegramInbox: [],
    telegramUpdateLog: [],
  };

  const matches = (row: Row, where: Row | undefined): boolean => {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (key === "OR") {
        if (!(cond as Row[]).some(w => matches(row, w))) return false;
        continue;
      }
      const value = row[key];
      if (
        cond !== null &&
        typeof cond === "object" &&
        !(cond instanceof Date) &&
        !Buffer.isBuffer(cond)
      ) {
        const c = cond as Row;
        if ("lt" in c && !(value !== null && value !== undefined && value < c.lt)) return false;
        if ("lte" in c && !(value !== null && value !== undefined && value <= c.lte)) return false;
        if ("in" in c && !(c.in as unknown[]).includes(value)) return false;
        continue;
      }
      if (Buffer.isBuffer(cond)) {
        if (!Buffer.isBuffer(value) || !cond.equals(value)) return false;
        continue;
      }
      if (cond instanceof Date) {
        if (!(value instanceof Date) || value.getTime() !== cond.getTime()) return false;
        continue;
      }
      if (cond === null) {
        if (value !== null && value !== undefined) return false;
        continue;
      }
      if (value !== cond) return false;
    }
    return true;
  };

  const apply = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (
        value &&
        typeof value === "object" &&
        !(value instanceof Date) &&
        !Buffer.isBuffer(value)
      ) {
        if ("increment" in value) row[key] = (row[key] ?? 0) + value.increment;
        else if ("decrement" in value) row[key] = (row[key] ?? 0) - value.decrement;
        else row[key] = value;
      } else row[key] = value;
    }
  };

  const sortBy = (rows: Row[], orderBy: Row[] | undefined) => {
    if (!orderBy) return rows;
    return [...rows].sort((a, b) => {
      for (const clause of orderBy) {
        const [key, dir] = Object.entries(clause)[0]!;
        const av = a[key],
          bv = b[key];
        if (av === bv) continue;
        const cmp = av < bv ? -1 : 1;
        return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  };

  const table = (name: string) => ({
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = {
        status: "PENDING",
        attempts: 0,
        claimedAt: null,
        doneAt: null,
        error: null,
        createdAt: new Date(),
        receivedAt: new Date(),
        ...data,
      };
      tables[name]!.push(row);
      return row;
    }),
    findMany: vi.fn(async ({ where, orderBy, take }: Row) =>
      sortBy(
        tables[name]!.filter(r => matches(r, where)),
        orderBy
      )
        .slice(0, take ?? undefined)
        .map(r => ({ ...r }))
    ),
    updateMany: vi.fn(async ({ where, data }: Row) => {
      const rows = tables[name]!.filter(r => matches(r, where));
      rows.forEach(r => apply(r, data));
      return { count: rows.length };
    }),
    update: vi.fn(async ({ where, data }: Row) => {
      const row = tables[name]!.find(r => matches(r, where));
      if (!row) throw new Error("not found");
      apply(row, data);
      return { ...row };
    }),
    deleteMany: vi.fn(async ({ where }: Row) => {
      const before = tables[name]!.length;
      tables[name] = tables[name]!.filter(r => !matches(r, where));
      return { count: before - tables[name]!.length };
    }),
  });

  const prisma: Row = {
    telegramOutbox: table("telegramOutbox"),
    telegramInbox: table("telegramInbox"),
    telegramUpdateLog: table("telegramUpdateLog"),
  };
  // deleteMany replaces the array, so the table helper must read through `tables`
  const reset = () => {
    tables.telegramOutbox = [];
    tables.telegramInbox = [];
    tables.telegramUpdateLog = [];
  };
  return { prisma, tables, reset };
});

vi.mock("@repo/database", () => ({
  prisma: store.prisma,
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    join: (v: unknown[]) => v,
  },
}));

const client = vi.hoisted(() => ({ bot: null as any, configured: false }));
vi.mock("../services/telegram/client", () => ({
  getTelegramBot: () => client.bot,
  isTelegramConfigured: () => client.configured,
}));

import {
  claimNextOutbox,
  clearOutboxHandlersForTests,
  drainOnce,
  enqueueOutbox,
  failureDisposition,
  purgeTelegramLogs,
  registerOutboxHandler,
  runOutboxJob,
} from "../services/telegram/loop";
import { TELEGRAM_LIMITS } from "@repo/constants";

const rows = () => store.tables.telegramOutbox!;

function apiError(code: number, retryAfter?: number) {
  return new GrammyError(
    "test",
    {
      ok: false,
      error_code: code,
      description: "test",
      parameters: retryAfter ? { retry_after: retryAfter } : undefined,
    } as any,
    "sendMessage",
    {}
  );
}

describe("Telegram sender loop", () => {
  beforeEach(() => {
    store.reset();
    clearOutboxHandlersForTests();
    client.bot = null;
    client.configured = false;
  });

  it("claims a job once: a second claimant gets nothing until the stale window passes", async () => {
    await enqueueOutbox("dm", { text: "hi" }, { chatId: 42 });
    const now = new Date();
    const first = await claimNextOutbox(now);
    const second = await claimNextOutbox(now);
    expect(first?.status).toBe("CLAIMED");
    expect(first?.attempts).toBe(1);
    expect(second).toBeNull();

    const later = new Date(now.getTime() + TELEGRAM_LIMITS.jobStaleMs + 1000);
    const resumed = await claimNextOutbox(later);
    expect(resumed?.id).toEqual(first?.id);
    expect(resumed?.attempts).toBe(2);
  });

  it("drains DM rows before broadcast rows regardless of insertion order", async () => {
    const seen: string[] = [];
    registerOutboxHandler("broadcast", async job => void seen.push(job.kind));
    registerOutboxHandler("dm", async job => void seen.push(job.kind));
    await enqueueOutbox("broadcast", { deliveryId: 1 }, { deliveryId: 1 });
    await enqueueOutbox("broadcast", { deliveryId: 2 }, { deliveryId: 2 });
    await enqueueOutbox("dm", { text: "a" }, { chatId: 1 });
    const handled = await drainOnce();
    expect(handled).toBe(3);
    expect(seen).toEqual(["dm", "broadcast", "broadcast"]);
    expect(rows().every(r => r.status === "DONE")).toBe(true);
  });

  it("does not run a job before runAfter", async () => {
    const now = new Date();
    await enqueueOutbox("dm", {}, { chatId: 1, runAfter: new Date(now.getTime() + 60_000) });
    expect(await claimNextOutbox(now)).toBeNull();
    expect(await claimNextOutbox(new Date(now.getTime() + 61_000))).not.toBeNull();
  });

  it("marks a job FAILED after jobMaxAttempts and never runs it again", async () => {
    registerOutboxHandler("dm", async () => {
      throw new Error("boom");
    });
    await enqueueOutbox("dm", {}, { chatId: 1 });
    let now = new Date();
    for (let i = 0; i < TELEGRAM_LIMITS.jobMaxAttempts; i += 1) {
      const job = await claimNextOutbox(now);
      expect(job).not.toBeNull();
      await runOutboxJob(job!, now);
      now = new Date(now.getTime() + TELEGRAM_LIMITS.jobStaleMs + 70_000);
    }
    expect(rows()[0]!.status).toBe("FAILED");
    expect(rows()[0]!.attempts).toBe(TELEGRAM_LIMITS.jobMaxAttempts);
    expect(await claimNextOutbox(now)).toBeNull();
  });

  it("a 429 moves runAfter by retry_after and gives the attempt back", async () => {
    registerOutboxHandler("dm", async () => {
      throw apiError(429, 7);
    });
    await enqueueOutbox("dm", {}, { chatId: 1 });
    const now = new Date();
    const job = await claimNextOutbox(now);
    const result = await runOutboxJob(job!, now);
    expect(result).toBe("retry");
    const row = rows()[0]!;
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(0);
    expect(row.runAfter.getTime()).toBe(now.getTime() + 7000);
  });

  it("failureDisposition caps retry_after at 300 seconds and backs off other errors", () => {
    const now = new Date(0);
    const slow = failureDisposition(apiError(429, 900), 1, now);
    expect(slow.runAfter.getTime()).toBe(300_000);
    expect(slow.countsAsAttempt).toBe(false);
    const other = failureDisposition(new Error("x"), 2, now);
    expect(other.status).toBe("PENDING");
    expect(other.runAfter.getTime()).toBe(4000);
    const last = failureDisposition(new Error("x"), TELEGRAM_LIMITS.jobMaxAttempts, now);
    expect(last.status).toBe("FAILED");
  });

  it("a kind with no handler fails fast with no_handler", async () => {
    await enqueueOutbox("group_check", {}, {});
    const job = await claimNextOutbox();
    expect(await runOutboxJob(job!)).toBe("failed");
    expect(rows()[0]!.error).toBe("no_handler");
  });

  it("a restart mid delivery sends once: a DONE row is never claimed again", async () => {
    let sends = 0;
    registerOutboxHandler("dm", async () => void (sends += 1));
    await enqueueOutbox("dm", {}, { chatId: 1 });
    await drainOnce();
    // Simulate a second process coming up and sweeping, far in the future
    await drainOnce(20, new Date(Date.now() + 10 * TELEGRAM_LIMITS.jobStaleMs));
    expect(sends).toBe(1);
  });

  it("inbox updates are replayed oldest first and marked DONE even with no bot configured", async () => {
    const base = Date.now();
    for (const [i, id] of [3, 1, 2].entries()) {
      store.tables.telegramInbox!.push({
        id: Buffer.from([i]),
        updateId: BigInt(id),
        chatId: 1n,
        payload: { update_id: id },
        status: "PENDING",
        attempts: 0,
        claimedAt: null,
        doneAt: null,
        error: null,
        createdAt: new Date(base + id),
      });
    }
    await drainOnce();
    const done = store.tables.telegramInbox!.map(r => [Number(r.updateId), r.status]);
    expect(done).toEqual([
      [3, "DONE"],
      [1, "DONE"],
      [2, "DONE"],
    ]);
  });

  it("purges update log and finished inbox rows older than the retention window", async () => {
    const old = new Date(Date.now() - (TELEGRAM_LIMITS.updateRetentionDays + 1) * 86_400_000);
    store.tables.telegramUpdateLog!.push({ updateId: 1n, receivedAt: old });
    store.tables.telegramUpdateLog!.push({ updateId: 2n, receivedAt: new Date() });
    store.tables.telegramInbox!.push({
      id: Buffer.from([1]),
      updateId: 1n,
      status: "DONE",
      createdAt: old,
    });
    store.tables.telegramInbox!.push({
      id: Buffer.from([2]),
      updateId: 3n,
      status: "PENDING",
      createdAt: old,
    });
    expect(await purgeTelegramLogs()).toBe(2);
    expect(store.tables.telegramUpdateLog!).toHaveLength(1);
    expect(store.tables.telegramInbox!).toHaveLength(1);
  });
});
