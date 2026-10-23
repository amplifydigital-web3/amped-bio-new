/**
 * The purge (Build Board #20, spec 3.12). Deleted items whose restore window has
 * passed lose their files: R2 objects, the Stream video and its clips, their
 * asset rows, and every viewer's playback position. The item row stays, with
 * purgeAfter cleared, as the record reports and copyright notices point at.
 * Space was given back when the item was deleted.
 *
 * Each item is independent: a storage error leaves that item for the next run.
 */
import { prisma } from "@repo/database";
import { deleteR2Object } from "../cloudflare/r2";
import { deleteStreamVideo } from "../cloudflare/stream";

/** Items purged per run, so one run stays short */
export const PURGE_BATCH = 50;

export async function purgeDeletedItems(now: Date = new Date()): Promise<number> {
  const due = await prisma.contentItem.findMany({
    where: { status: "DELETED", purgeAfter: { lte: now } },
    select: { id: true, publicId: true },
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
        await tx.contentAsset.deleteMany({ where: { contentItemId: item.id } });
        await tx.viewerProgress.deleteMany({ where: { contentItemId: item.id } });
        await tx.contentItem.updateMany({
          where: { id: item.id, status: "DELETED" },
          data: { purgeAfter: null },
        });
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
