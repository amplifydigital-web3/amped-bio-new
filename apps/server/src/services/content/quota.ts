/**
 * Per creator storage quota (Build Board #20, spec 3.2 and 3.5).
 *
 * Bytes move through three buckets:
 *   createUpload    reserve   (bytes_reserved += size, refused past the limit)
 *   READY           commit    (bytes_reserved -= size, bytes_used += size)
 *   failed/aborted  release   (bytes_reserved -= size)
 *
 * The reservation is one conditional UPDATE, so two uploads racing for the last
 * gigabyte cannot both pass. Every change runs on the client passed in, so callers
 * put it in the same transaction as the item's status change.
 */
import { prisma } from "@repo/database";
import { env } from "../../env";
import { uuidv7 } from "../../utils/uuid-v7";

/** The client or an interactive transaction: both carry these members. */
export type QuotaDb = Pick<typeof prisma, "userStorageQuota" | "$executeRaw">;
type Db = QuotaDb;

const MB = 1024n * 1024n;

export function defaultBytesLimit(): bigint {
  return BigInt(Math.floor(env.CONTENT_QUOTA_DEFAULT_MB)) * MB;
}

/** Creates the quota row with the env defaults the first time a creator uploads. */
export async function ensureQuota(userId: number, db: Db = prisma) {
  return db.userStorageQuota.upsert({
    where: { userId },
    update: {},
    create: {
      id: uuidv7(),
      userId,
      bytesLimit: defaultBytesLimit(),
      videoMinutesLimit: Math.floor(env.CONTENT_QUOTA_VIDEO_MINUTES),
    },
  });
}

/** True when `bytes` fit and were reserved. Never goes past the limit. */
export async function reserveBytes(
  userId: number,
  bytes: bigint,
  db: Db = prisma
): Promise<boolean> {
  const changed = await db.$executeRaw`
    UPDATE user_storage_quotas
       SET bytes_reserved = bytes_reserved + ${bytes}, updated_at = NOW(3)
     WHERE user_id = ${userId}
       AND bytes_used + bytes_reserved + ${bytes} <= bytes_limit`;
  return changed === 1;
}

/** Gives reserved bytes back. Floors at zero so a double release cannot go negative. */
export async function releaseBytes(userId: number, bytes: bigint, db: Db = prisma): Promise<void> {
  await db.$executeRaw`
    UPDATE user_storage_quotas
       SET bytes_reserved = GREATEST(bytes_reserved - ${bytes}, 0), updated_at = NOW(3)
     WHERE user_id = ${userId}`;
}

/** Moves reserved bytes to used and adds video minutes, at READY. */
export async function commitBytes(
  userId: number,
  bytes: bigint,
  videoMinutes: number,
  db: Db = prisma
): Promise<void> {
  await db.$executeRaw`
    UPDATE user_storage_quotas
       SET bytes_reserved = GREATEST(bytes_reserved - ${bytes}, 0),
           bytes_used = bytes_used + ${bytes},
           video_minutes_used = video_minutes_used + ${videoMinutes},
           updated_at = NOW(3)
     WHERE user_id = ${userId}`;
}

export function videoMinutesLeft(quota: { videoMinutesLimit: number; videoMinutesUsed: number }) {
  return Math.max(0, quota.videoMinutesLimit - quota.videoMinutesUsed);
}

/** Video minutes charged for a duration: whole minutes, rounded up. */
export function minutesForDuration(durationMs: number | null | undefined): number {
  if (!durationMs || durationMs <= 0) return 0;
  return Math.ceil(durationMs / 60_000);
}
