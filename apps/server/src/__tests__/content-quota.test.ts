/**
 * Content system PR 2 (Build Board #20): the quota is changed with single
 * conditional UPDATE statements so two uploads racing for the last bytes cannot
 * both pass. These tests pin the SQL. The same statements were run against MariaDB
 * 10.11 on the full migration history (docs/fixes/content-foundation.md, 4.2).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@repo/database", () => ({ prisma: {} }));

import {
  commitBytes,
  defaultBytesLimit,
  ensureQuota,
  releaseBytes,
  reserveBytes,
  videoMinutesLeft,
  type QuotaDb,
} from "../services/content/quota";

function fakeDb(changedRows = 1) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join("?").replace(/\s+/g, " ").trim(), values });
      return changedRows;
    }),
    userStorageQuota: { upsert: vi.fn(async (args: unknown) => args) },
  } as unknown as QuotaDb;
  return { db, calls };
}

describe("storage quota", () => {
  it("reserves only when used plus reserved plus the new size fits the limit", async () => {
    const { db, calls } = fakeDb(1);
    expect(await reserveBytes(7, 4096n, db)).toBe(true);
    expect(calls[0]!.sql).toBe(
      "UPDATE user_storage_quotas SET bytes_reserved = bytes_reserved + ?, updated_at = NOW(3) WHERE user_id = ? AND bytes_used + bytes_reserved + ? <= bytes_limit"
    );
    expect(calls[0]!.values).toEqual([4096n, 7, 4096n]);
  });

  it("reports a refused reservation when no row changed", async () => {
    const { db } = fakeDb(0);
    expect(await reserveBytes(7, 10n ** 12n, db)).toBe(false);
  });

  it("releases with a floor at zero and commits reserved to used with video minutes", async () => {
    const { db, calls } = fakeDb();
    await releaseBytes(7, 100n, db);
    await commitBytes(7, 100n, 3, db);
    expect(calls[0]!.sql).toContain("bytes_reserved = GREATEST(bytes_reserved - ?, 0)");
    expect(calls[1]!.sql).toContain("bytes_used = bytes_used + ?");
    expect(calls[1]!.sql).toContain("video_minutes_used = video_minutes_used + ?");
    expect(calls[1]!.values).toEqual([100n, 100n, 3, 7]);
  });

  it("creates the quota row with the env defaults (5 GB, 300 minutes)", async () => {
    const { db } = fakeDb();
    await ensureQuota(7, db);
    const args = (db.userStorageQuota.upsert as any).mock.calls[0][0];
    expect(args.where).toEqual({ userId: 7 });
    expect(args.update).toEqual({});
    expect(args.create).toMatchObject({
      userId: 7,
      bytesLimit: 5120n * 1024n * 1024n,
      videoMinutesLimit: 300,
    });
    expect(args.create.id).toHaveLength(16);
    expect(defaultBytesLimit()).toBe(5_368_709_120n);
  });

  it("never reports negative minutes left", () => {
    expect(videoMinutesLeft({ videoMinutesLimit: 300, videoMinutesUsed: 120 })).toBe(180);
    expect(videoMinutesLeft({ videoMinutesLimit: 300, videoMinutesUsed: 400 })).toBe(0);
  });
});
