/**
 * The purge (Build Board #20, spec 3.12). Deleted items whose restore window has
 * passed lose their files: R2 objects, the Stream video and its clips, their
 * asset rows, and every viewer's playback position. The item row stays, with
 * purgeAfter cleared, as the record reports and copyright notices point at.
 * The space the item held is given back here, when its files are really gone.
 *
 * Each item is independent: a storage error leaves that item for the next run.
 */
import { prisma } from "@repo/database";
import { deleteR2Object } from "../cloudflare/r2";
import { deleteStreamVideo } from "../cloudflare/stream";
import { freeUsedBytes, itemMinutes } from "./quota";

/** Items purged per run, so one run stays short */
export const PURGE_BATCH = 50;

/**
 * True when the item still holds quota space.
 *
 * A live item deleted with a restore window keeps its files in the bucket until
 * the purge, so its space stays charged until then. Failed and blocked items
 * gave their space back when they failed (failItem) and are purged at once, so
 * they hold nothing. The restore window tells the two apart: the purge date is
 * later than the deletion date only for the items that were live.
 */
export function heldQuota(item: { deletedAt: Date | null; purgeAfter: Date | null }): boolean {
  return (
    item.deletedAt !== null &&
    item.purgeAfter !== null &&
    item.purgeAfter.getTime() > item.deletedAt.getTime()
  );
}

export async function purgeDeletedItems(now: Date = new Date()): Promise<number> {
  const due = await prisma.contentItem.findMany({
    where: { status: "DELETED", purgeAfter: { lte: now } },
    select: {
      id: true,
      publicId: true,
      userId: true,
      totalBytes: true,
      kind: true,
      durationMs: true,
      deletedAt: true,
      purgeAfter: true,
    },
    take: PURGE_BATCH,
  });
  let purged = 0;
  for (const item of due) {
    try {
      const assets = await prisma.contentAsset.findMany({
        where: { contentItemId: item.id },
        select: { r2Key: true, streamUid: true, role: true },
      });
      const streamUids = new Set(
        assets
          .filter(asset => asset.role === "STREAM" || asset.role === "PREVIEW_CLIP")
          .map(asset => asset.streamUid)
          .filter((uid): uid is string => !!uid)
      );
      const r2Keys = new Set(
        assets.map(asset => asset.r2Key).filter((key): key is string => !!key)
      );
      for (const uid of streamUids) await deleteStreamVideo(uid);
      for (const key of r2Keys) await deleteR2Object(key);
      await prisma.$transaction(async tx => {
        const cleared = await tx.contentItem.updateMany({
          where: { id: item.id, status: "DELETED" },
          data: { purgeAfter: null },
        });
        await tx.contentAsset.deleteMany({ where: { contentItemId: item.id } });
        await tx.viewerProgress.deleteMany({ where: { contentItemId: item.id } });
        // The files are gone, so the space they took comes back now. The item was
        // restored in the meantime, so it still holds its space: nothing to free.
        if (cleared.count === 1 && heldQuota(item)) {
          await freeUsedBytes(item.userId, item.totalBytes, itemMinutes(item), tx);
        }
      });
      purged += 1;
    } catch (error) {
      console.error(
        "[content] purge failed, retrying next run",
        JSON.stringify({
          publicId: item.publicId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }
  return purged;
}
