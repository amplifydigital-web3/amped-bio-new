/**
 * Fan Library offline downloads (Build Board #26, FL-5, spec 3.5 Offline and
 * decision C). The file lives only in the fan's installed app (Cache Storage);
 * the server keeps one DownloadRecord per copy so the app can ask, on every
 * sync, which copies the fan may still open.
 *
 * - A copy is allowed only where the creator allows downloads, for an item the
 *   fan may list (libraryAccess, the same rule as every Library list).
 * - Video uses Stream's MP4 rendition; audio, documents and files use the
 *   gateway's single use link (buildDownload, content decision 24).
 * - A check marks a record removed when the fan lost access, the item went
 *   away, or the creator turned downloads off. The app deletes those files.
 * - Records are personal data, deleted with the account (cascade). Creators
 *   never see them.
 */
import { prisma, type ContentItem } from "@repo/database";
import {
  LIBRARY_DOWNLOADS,
  canKeepOffline,
  type LibraryDownloadGrant,
  type LibraryDownloadRecord,
  type LibraryDownloadRemovedReason,
  type LibraryDownloadsCheck,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { hitRateLimit } from "../../utils/rateLimit";
import { newDownloadJti } from "../cloudflare/mediaToken";
import { servedAssetsClean } from "../content/access";
import { buildDownload, DeliveryError } from "../content/delivery";
import { libraryAccess } from "./access";
import { ITEM_CREATOR_SELECT, toLibraryItems, type ItemWithCreator } from "./library";

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");

export class DownloadRefused extends Error {
  constructor(readonly reason: "notFound" | "downloadsOff" | "notReady" | "cap" | "unknownRecord") {
    super(reason);
  }
}

/** Why the fan may no longer keep a copy of this item, or null when they may. */
export function removalReason(
  item: ItemWithCreator,
  viewerId: number
): Exclude<LibraryDownloadRemovedReason, "removed"> | null {
  if (
    item.deletedAt !== null ||
    item.status !== "READY" ||
    item.publishState !== "PUBLISHED" ||
    item.moderationState !== "CLEAR"
  ) {
    return "unavailable";
  }
  if (!libraryAccess(item, item.user, viewerId)) return "access";
  if (!item.allowDownload) return "downloadsOff";
  return null;
}

async function loadItem(publicId: string): Promise<ItemWithCreator | null> {
  return prisma.contentItem.findUnique({
    where: { publicId },
    include: { user: { select: ITEM_CREATOR_SELECT } },
  });
}

/**
 * Starts a download: checks the item, writes the record, and returns a short
 * lived single use link the app fetches into its cache at once.
 */
export async function recordDownload(
  viewerId: number,
  publicId: string,
  device: string,
  now: Date = new Date()
): Promise<LibraryDownloadGrant> {
  const item = await loadItem(publicId);
  if (!item) throw new DownloadRefused("notFound");
  const reason = removalReason(item, viewerId);
  if (reason === "downloadsOff") throw new DownloadRefused("downloadsOff");
  if (reason) throw new DownloadRefused("notFound");
  const [listed] = await toLibraryItems(viewerId, [item], undefined, now);
  if (!listed) throw new DownloadRefused("notFound");
  if (!canKeepOffline(listed)) throw new DownloadRefused("downloadsOff");

  const assets = await prisma.contentAsset.findMany({ where: { contentItemId: item.id } });
  if (!servedAssetsClean(assets)) throw new DownloadRefused("notFound");

  if (
    (await hitRateLimit(`library-dl:${viewerId}:${publicId}`, 24 * 60 * 60)) >
    LIBRARY_DOWNLOADS.perDay
  ) {
    throw new DownloadRefused("cap");
  }

  const jti = newDownloadJti();
  let download;
  try {
    download = await buildDownload(item, assets, now, jti);
  } catch (error) {
    if (error instanceof DeliveryError) {
      throw new DownloadRefused(error.reason === "no_download" ? "downloadsOff" : "notReady");
    }
    throw error;
  }

  const id = uuidv7();
  await prisma.downloadRecord.create({
    data: {
      id,
      userId: viewerId,
      contentItemId: item.id,
      grantJti: jti,
      device,
      createdAt: now,
    },
  });
  return {
    id: hex(id),
    item: listed,
    url: download.url,
    fileName: download.fileName,
    expiresAt: download.expiresAt,
  };
}

async function ownRecord(viewerId: number, id: string) {
  const record = await prisma.downloadRecord.findUnique({ where: { id: Buffer.from(id, "hex") } });
  if (!record || record.userId !== viewerId) throw new DownloadRefused("unknownRecord");
  return record;
}

/** The app saved the file: keep its size, for the storage line. */
export async function markDownloaded(
  viewerId: number,
  id: string,
  bytes: number
): Promise<{ ok: true }> {
  const record = await ownRecord(viewerId, id);
  await prisma.downloadRecord.update({ where: { id: record.id }, data: { bytes: BigInt(bytes) } });
  return { ok: true };
}

/** The fan removed a copy (swipe, Remove, Clear all). Removing twice is fine. */
export async function removeDownload(
  viewerId: number,
  id: string,
  now: Date = new Date()
): Promise<{ ok: true }> {
  const record = await ownRecord(viewerId, id);
  if (!record.removedAt) {
    await prisma.downloadRecord.update({
      where: { id: record.id },
      data: { removedAt: now, removedReason: "removed" },
    });
  }
  return { ok: true };
}

/** The copies this app keeps, newest first, with each item as the Library lists it. */
export async function listDownloads(
  viewerId: number,
  device: string,
  now: Date = new Date()
): Promise<{ items: LibraryDownloadRecord[] }> {
  const rows = await prisma.downloadRecord.findMany({
    where: { userId: viewerId, device, removedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIBRARY_DOWNLOADS.checkMax,
    include: { contentItem: { include: { user: { select: ITEM_CREATOR_SELECT } } } },
  });
  const items = await toLibraryItems(
    viewerId,
    rows.map(row => row.contentItem),
    undefined,
    now
  );
  const byPublicId = new Map(items.map(item => [item.publicId, item]));
  const out: LibraryDownloadRecord[] = [];
  for (const row of rows) {
    const item = byPublicId.get(row.contentItem.publicId);
    if (!item) continue;
    out.push({
      id: hex(row.id),
      bytes: Number(row.bytes),
      createdAt: row.createdAt.toISOString(),
      item,
    });
  }
  return { items: out };
}

/**
 * The sync check (app open, and every 6 hours while open). For each record the
 * app names: still allowed, or removed with a reason. Records that are not this
 * fan's, or were removed already, come back removed so the app deletes the file.
 */
export async function checkDownloads(
  viewerId: number,
  device: string,
  ids: string[],
  now: Date = new Date()
): Promise<LibraryDownloadsCheck> {
  const unique = [...new Set(ids)];
  const rows = unique.length
    ? await prisma.downloadRecord.findMany({
        where: { id: { in: unique.map(id => Buffer.from(id, "hex")) } },
        include: { contentItem: { include: { user: { select: ITEM_CREATOR_SELECT } } } },
      })
    : [];
  const byId = new Map(rows.map(row => [hex(row.id), row]));
  const allowed: string[] = [];
  const removed: LibraryDownloadsCheck["removed"] = [];
  const toClose: { id: Buffer; reason: string }[] = [];

  for (const id of unique) {
    const row = byId.get(id);
    if (!row || row.userId !== viewerId || row.device !== device) {
      removed.push({ id, reason: "unavailable" });
      continue;
    }
    if (row.removedAt) {
      const reason = (row.removedReason ?? "removed") as LibraryDownloadRemovedReason;
      removed.push({ id, reason });
      continue;
    }
    const reason = removalReason(row.contentItem as ContentItem & ItemWithCreator, viewerId);
    if (reason) {
      removed.push({ id, reason });
      toClose.push({ id: Buffer.from(row.id), reason });
    } else {
      allowed.push(id);
    }
  }

  // One update per reason, so a check that closes many copies stays cheap
  const byReason = new Map<string, Buffer[]>();
  for (const { id, reason } of toClose) byReason.set(reason, [...(byReason.get(reason) ?? []), id]);
  for (const [reason, recordIds] of byReason) {
    await prisma.downloadRecord.updateMany({
      where: { id: { in: recordIds }, removedAt: null },
      data: { removedAt: now, removedReason: reason },
    });
  }

  return { allowed, removed, checkedAt: now.toISOString() };
}
