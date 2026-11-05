/**
 * Fan Library reads and writes (Build Board #26, FL-2, spec 3.6). The router is
 * thin; the work is here so it can be tested without tRPC.
 *
 * Connected creators are the ones the fan follows (published, not suspended).
 * Memberships, purchases and pool stakes join them in FL-6 and FL-7. Every
 * list pages over items the fan can open (access.ts) and builds cards through
 * the public card builder, so covers are the only URLs a list returns.
 */
import { prisma, type ContentItem, type Prisma } from "@repo/database";
import {
  LIBRARY_LIMITS,
  contentResumePoint,
  libraryThemeSummary,
  type AnyThemeConfig,
  type LibraryConnection,
  type LibraryCreatorHeader,
  type LibraryCreatorRow,
  type LibraryItem,
  type LibraryOwner,
  type LibraryPage,
  type LibrarySearchGroup,
  type LibraryShopItem,
  type LibraryThemeSummary,
} from "@repo/constants";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { uuidv7 } from "../../utils/uuid-v7";
import { cardsForItems } from "../content/publicView";
import { toDbKind } from "../content/ids";
import { batchPoolFanCreatorIds } from "../follow/poolFans";
import { LIBRARY_CREATOR_WHERE, LIBRARY_ITEM_WHERE, libraryAccess } from "./access";

type ItemWithCreator = ContentItem & { user: { page_status: string; block: string } };

const ITEM_CREATOR_SELECT = { page_status: true, block: true } as const;

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");

// ---------------------------------------------------------------- owners

interface OwnerInfo {
  owner: LibraryOwner;
  theme: LibraryThemeSummary | null;
}

const OWNER_SELECT = {
  id: true,
  handle: true,
  name: true,
  image: true,
  image_file_id: true,
  theme: true,
} as const;

type OwnerRow = {
  id: number;
  handle: string | null;
  name: string | null;
  image: string | null;
  image_file_id: number | null;
  theme: string | null;
};

/** Profile, accent and the still theme for each creator, in one theme read. */
async function ownerInfo(users: OwnerRow[]): Promise<Map<number, OwnerInfo>> {
  const themeIds = [
    ...new Set(users.map(user => Number(user.theme)).filter(id => Number.isInteger(id) && id > 0)),
  ];
  const themes = themeIds.length
    ? await prisma.theme.findMany({
        where: { id: { in: themeIds } },
        select: { id: true, config: true },
      })
    : [];
  const themeById = new Map(
    themes.map(theme => [theme.id, libraryThemeSummary(theme.config as AnyThemeConfig | null)])
  );
  const out = new Map<number, OwnerInfo>();
  await Promise.all(
    users.map(async user => {
      const image = await getFileUrl({
        legacyImageField: user.image,
        imageFileId: user.image_file_id,
      }).catch(() => null);
      const theme = themeById.get(Number(user.theme)) ?? null;
      out.set(user.id, {
        owner: {
          handle: (user.handle ?? "").toLowerCase(),
          name: user.name,
          image: image ?? null,
          accent: theme?.button ?? null,
        },
        theme,
      });
    })
  );
  return out;
}

async function ownersFor(creatorIds: number[]): Promise<Map<number, OwnerInfo>> {
  const unique = [...new Set(creatorIds)];
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: OWNER_SELECT,
  });
  return ownerInfo(users);
}

// ---------------------------------------------------------------- creators the fan follows

/** Followed creators whose pages are public, newest follow first. */
export async function followedCreatorIds(viewerId: number): Promise<number[]> {
  const rows = await prisma.follow.findMany({
    where: { follower_id: viewerId, creator: LIBRARY_CREATOR_WHERE },
    orderBy: { id: "desc" },
    take: LIBRARY_LIMITS.creatorsMax,
    select: { creator_id: true },
  });
  return rows.map(row => row.creator_id);
}

/** A public creator by handle, with what the section header needs. */
async function creatorByHandle(handle: string): Promise<OwnerRow | null> {
  const user = await prisma.user.findFirst({
    where: { handle: handle.toLowerCase(), ...LIBRARY_CREATOR_WHERE },
    select: OWNER_SELECT,
  });
  return user?.handle ? user : null;
}

// ---------------------------------------------------------------- items

interface ItemExtras {
  progress?: Map<string, { positionMs: number; durationMs: number | null; completed: boolean }>;
  saved?: Map<string, Date>;
}

/** Progress and saved times for a page of items, two reads for the whole page. */
async function extrasFor(viewerId: number, items: ContentItem[]): Promise<Required<ItemExtras>> {
  const ids = items.map(item => Buffer.from(item.id));
  if (!ids.length) return { progress: new Map(), saved: new Map() };
  const [progressRows, savedRows] = await Promise.all([
    prisma.viewerProgress.findMany({
      where: { userId: viewerId, contentItemId: { in: ids } },
      select: { contentItemId: true, positionMs: true, durationMs: true, completed: true },
    }),
    prisma.savedItem.findMany({
      where: { userId: viewerId, contentItemId: { in: ids } },
      select: { contentItemId: true, createdAt: true },
    }),
  ]);
  return {
    progress: new Map(
      progressRows.map(row => [
        hex(row.contentItemId),
        { positionMs: row.positionMs, durationMs: row.durationMs, completed: row.completed },
      ])
    ),
    saved: new Map(savedRows.map(row => [hex(row.contentItemId), row.createdAt])),
  };
}

/**
 * Library items for rows already read, in the given order. Rows the viewer may
 * not list, and rows whose assets have not passed the scan, are dropped.
 */
async function toLibraryItems(
  viewerId: number,
  rows: ItemWithCreator[],
  extras?: ItemExtras,
  now: Date = new Date()
): Promise<LibraryItem[]> {
  const allowed = rows
    .map(row => ({ row, access: libraryAccess(row, row.user, viewerId) }))
    .filter(
      (entry): entry is { row: ItemWithCreator; access: NonNullable<typeof entry.access> } =>
        entry.access !== null
    );
  if (!allowed.length) return [];
  const items = allowed.map(entry => entry.row);
  const [cards, owners, loaded] = await Promise.all([
    cardsForItems(items, now),
    ownersFor(items.map(item => item.userId)),
    extras ? Promise.resolve(extras) : extrasFor(viewerId, items),
  ]);
  const out: LibraryItem[] = [];
  for (const { row, access } of allowed) {
    const card = cards.get(row.publicId);
    const owner = owners.get(row.userId)?.owner;
    if (!card || !owner?.handle) continue;
    const key = hex(row.id);
    out.push({
      ...card,
      owner,
      accessSource: access.source,
      planName: access.planName,
      progress: loaded.progress?.get(key) ?? null,
      savedAt: loaded.saved?.get(key)?.toISOString() ?? null,
    });
  }
  return out;
}

/** Newest first over openable items, paged by the last item's publicId. */
async function pageItems(
  viewerId: number,
  where: Prisma.ContentItemWhereInput,
  cursor: string | undefined,
  limit: number = LIBRARY_LIMITS.page
): Promise<LibraryPage<LibraryItem>> {
  let cursorOk = false;
  if (cursor) {
    const at = await prisma.contentItem.findFirst({
      where: { publicId: cursor, ...where },
      select: { id: true },
    });
    cursorOk = !!at;
  }
  const rows = await prisma.contentItem.findMany({
    where: { ...LIBRARY_ITEM_WHERE, ...where, user: LIBRARY_CREATOR_WHERE },
    include: { user: { select: ITEM_CREATOR_SELECT } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    ...(cursorOk ? { cursor: { publicId: cursor! }, skip: 1 } : {}),
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return {
    items: await toLibraryItems(viewerId, page),
    nextCursor: rows.length > limit ? page[page.length - 1]!.publicId : null,
  };
}

// ---------------------------------------------------------------- procedures

/** Continue: up to 12 unfinished items, last played first, access rechecked. */
export async function libraryContinue(viewerId: number, handle?: string): Promise<LibraryItem[]> {
  const creator = handle ? await creatorByHandle(handle) : null;
  if (handle && !creator) return [];
  const rows = await prisma.viewerProgress.findMany({
    where: {
      userId: viewerId,
      completed: false,
      ...(creator ? { contentItem: { userId: creator.id } } : {}),
    },
    orderBy: { lastPlayedAt: "desc" },
    take: LIBRARY_LIMITS.continueScan,
    include: { contentItem: { include: { user: { select: ITEM_CREATOR_SELECT } } } },
  });
  const unfinished = rows.filter(
    row =>
      contentResumePoint(
        { positionMs: row.positionMs, durationMs: row.durationMs, completed: row.completed },
        row.contentItem.durationMs
      ) !== null
  );
  const items = await toLibraryItems(
    viewerId,
    unfinished.map(row => row.contentItem)
  );
  return items.slice(0, LIBRARY_LIMITS.continueMax);
}

/** Newest from the creators the fan follows. */
export async function libraryNewest(
  viewerId: number,
  input: {
    cursor?: string;
    type?: Parameters<typeof toDbKind>[0];
    source?: string;
    where?: "everywhere" | "device";
    deviceIds?: string[];
  } = {}
): Promise<LibraryPage<LibraryItem>> {
  // Before gating every listed item is public: any other source is an empty list
  if (input.source && input.source !== "public") return { items: [], nextCursor: null };
  const creatorIds = await followedCreatorIds(viewerId);
  if (!creatorIds.length) return { items: [], nextCursor: null };
  if (input.where === "device" && !input.deviceIds?.length) return { items: [], nextCursor: null };
  return pageItems(
    viewerId,
    {
      userId: { in: creatorIds },
      ...(input.type ? { kind: toDbKind(input.type) } : {}),
      ...(input.where === "device" ? { publicId: { in: input.deviceIds } } : {}),
    },
    input.cursor
  );
}

function connectionFor(following: boolean, poolFan: boolean): LibraryConnection {
  return { following, member: false, purchases: 0, poolFan };
}

/** New since the fan last opened the section, or since they followed. */
async function newCounts(
  viewerId: number,
  follows: Array<{ creatorId: number; followedAt: Date }>
): Promise<Map<number, number>> {
  const visits = await prisma.libraryCreatorVisit.findMany({
    where: { userId: viewerId, creatorId: { in: follows.map(follow => follow.creatorId) } },
  });
  const visitedAt = new Map(visits.map(visit => [visit.creatorId, visit.lastVisitedAt]));
  const counts = await Promise.all(
    follows.map(async follow => {
      const since = visitedAt.get(follow.creatorId) ?? follow.followedAt;
      const count = await prisma.contentItem.count({
        where: { userId: follow.creatorId, ...LIBRARY_ITEM_WHERE, publishedAt: { gt: since } },
      });
      return [follow.creatorId, count] as const;
    })
  );
  return new Map(counts);
}

/** Your creators: one row per followed creator, newest follow first. */
export async function libraryCreators(
  viewerId: number,
  input: { cursor?: string; q?: string } = {}
): Promise<LibraryPage<LibraryCreatorRow>> {
  const q = input.q?.trim();
  const cursorId = input.cursor && /^\d+$/.test(input.cursor) ? Number(input.cursor) : null;
  const rows = await prisma.follow.findMany({
    where: {
      follower_id: viewerId,
      creator: {
        ...LIBRARY_CREATOR_WHERE,
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { handle: { contains: q.replace(/^@/, "").toLowerCase() } },
              ],
            }
          : {}),
      },
    },
    orderBy: { id: "desc" },
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    take: LIBRARY_LIMITS.page + 1,
    select: { id: true, created_at: true, creator: { select: OWNER_SELECT } },
  });
  const page = rows.slice(0, LIBRARY_LIMITS.page);
  const creatorIds = page.map(row => row.creator.id);
  const [owners, poolFans, counts] = await Promise.all([
    ownerInfo(page.map(row => row.creator)),
    batchPoolFanCreatorIds(creatorIds, viewerId),
    newCounts(
      viewerId,
      page.map(row => ({ creatorId: row.creator.id, followedAt: row.created_at }))
    ),
  ]);
  const items: LibraryCreatorRow[] = [];
  for (const row of page) {
    const info = owners.get(row.creator.id);
    if (!info?.owner.handle) continue;
    items.push({
      owner: info.owner,
      connection: connectionFor(true, poolFans.has(row.creator.id)),
      newCount: counts.get(row.creator.id) ?? 0,
      pastDue: false,
    });
  }
  return {
    items,
    nextCursor: rows.length > LIBRARY_LIMITS.page ? String(page[page.length - 1]!.id) : null,
  };
}

/**
 * The creator section header (board m4). Opening it records the visit, which
 * resets the new count. Null when the creator's page is not public.
 */
export async function libraryCreator(
  viewerId: number,
  handle: string,
  now: Date = new Date()
): Promise<LibraryCreatorHeader | null> {
  const creator = await creatorByHandle(handle);
  if (!creator) return null;
  const [info, follow, poolFans, yours] = await Promise.all([
    ownerInfo([creator]),
    prisma.follow.findUnique({
      where: { follower_id_creator_id: { follower_id: viewerId, creator_id: creator.id } },
      select: { show_publicly: true, email_updates: true },
    }),
    batchPoolFanCreatorIds([creator.id], viewerId),
    prisma.contentItem.count({ where: { userId: creator.id, ...LIBRARY_ITEM_WHERE } }),
  ]);
  const own = creator.id === viewerId;
  const connected = !!follow && !own;
  if (connected) {
    await prisma.libraryCreatorVisit.upsert({
      where: { userId_creatorId: { userId: viewerId, creatorId: creator.id } },
      create: { id: uuidv7(), userId: viewerId, creatorId: creator.id, lastVisitedAt: now },
      update: { lastVisitedAt: now },
    });
  }
  const owner = info.get(creator.id)!;
  return {
    connected,
    owner: owner.owner,
    theme: owner.theme,
    connection: connectionFor(!!follow, poolFans.has(creator.id)),
    status: {
      membership: null,
      purchases: { count: 0 },
      follow: follow
        ? { showPublicly: follow.show_publicly, emailUpdates: follow.email_updates }
        : null,
    },
    counts: { yours: connected ? yours : 0, shop: 0 },
  };
}

/** Yours (newest; collections group it once bundles ship) or Shop (FL-6). */
export async function libraryCreatorItems(
  viewerId: number,
  input: { handle: string; seg: "yours" | "shop"; cursor?: string }
): Promise<LibraryPage<LibraryItem> | LibraryPage<LibraryShopItem>> {
  const empty = { items: [], nextCursor: null };
  const creator = await creatorByHandle(input.handle);
  if (!creator || creator.id === viewerId) return empty;
  const follow = await prisma.follow.findUnique({
    where: { follower_id_creator_id: { follower_id: viewerId, creator_id: creator.id } },
    select: { id: true },
  });
  if (!follow) return empty;
  // Shop lists items the fan can not open yet; nothing is gated before FL-6
  if (input.seg === "shop") return empty as LibraryPage<LibraryShopItem>;
  return pageItems(viewerId, { userId: creator.id }, input.cursor);
}

/** Search titles and descriptions of items the fan can open, grouped by creator. */
export async function librarySearch(
  viewerId: number,
  input: {
    q: string;
    scope: "all" | "creator" | "device";
    handle?: string;
    deviceIds?: string[];
    cursor?: string;
  }
): Promise<{ groups: LibrarySearchGroup[]; nextCursor: string | null }> {
  const empty = { groups: [], nextCursor: null };
  let creatorIds = await followedCreatorIds(viewerId);
  if (input.scope === "creator") {
    const creator = input.handle ? await creatorByHandle(input.handle) : null;
    if (!creator || !creatorIds.includes(creator.id)) return empty;
    creatorIds = [creator.id];
  }
  if (!creatorIds.length) return empty;
  if (input.scope === "device" && !input.deviceIds?.length) return empty;
  const q = input.q.trim();
  const page = await pageItems(
    viewerId,
    {
      userId: { in: creatorIds },
      OR: [{ title: { contains: q } }, { description: { contains: q } }],
      ...(input.scope === "device" ? { publicId: { in: input.deviceIds } } : {}),
    },
    input.cursor
  );
  return { groups: groupByOwner(page.items), nextCursor: page.nextCursor };
}

/** Results grouped by creator, in the order each creator first appears. */
export function groupByOwner(items: LibraryItem[]): LibrarySearchGroup[] {
  const groups = new Map<string, LibrarySearchGroup>();
  for (const item of items) {
    const group = groups.get(item.owner.handle);
    if (group) group.items.push(item);
    else groups.set(item.owner.handle, { owner: item.owner, items: [item] });
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------- saved

/** Saved, newest save first. An item the fan can no longer open is hidden, not removed. */
export async function librarySaved(
  viewerId: number,
  cursor?: string
): Promise<LibraryPage<LibraryItem>> {
  const cursorId = cursor && /^[0-9a-f]{32}$/.test(cursor) ? Buffer.from(cursor, "hex") : null;
  let cursorOk = false;
  if (cursorId) {
    const at = await prisma.savedItem.findUnique({
      where: { id: cursorId },
      select: { userId: true },
    });
    cursorOk = at?.userId === viewerId;
  }
  const rows = await prisma.savedItem.findMany({
    where: { userId: viewerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursorOk ? { cursor: { id: cursorId! }, skip: 1 } : {}),
    take: LIBRARY_LIMITS.page + 1,
    include: { contentItem: { include: { user: { select: ITEM_CREATOR_SELECT } } } },
  });
  const page = rows.slice(0, LIBRARY_LIMITS.page);
  const items = await toLibraryItems(
    viewerId,
    page.map(row => row.contentItem)
  );
  return {
    items,
    nextCursor: rows.length > LIBRARY_LIMITS.page ? hex(page[page.length - 1]!.id) : null,
  };
}

export class LibraryNotFound extends Error {}

/** Saves an item the fan can open. Saving twice keeps the first save. */
export async function librarySave(viewerId: number, publicId: string): Promise<{ saved: true }> {
  const item = await prisma.contentItem.findUnique({
    where: { publicId },
    include: { user: { select: ITEM_CREATOR_SELECT } },
  });
  if (!item || !libraryAccess(item, item.user, viewerId)) throw new LibraryNotFound();
  await prisma.savedItem.upsert({
    where: { userId_contentItemId: { userId: viewerId, contentItemId: item.id } },
    create: { id: uuidv7(), userId: viewerId, contentItemId: item.id },
    update: {},
  });
  return { saved: true };
}

/** Removes a save. Unknown items and items never saved are fine. */
export async function libraryUnsave(viewerId: number, publicId: string): Promise<{ saved: false }> {
  const item = await prisma.contentItem.findUnique({ where: { publicId }, select: { id: true } });
  if (item) {
    await prisma.savedItem.deleteMany({ where: { userId: viewerId, contentItemId: item.id } });
  }
  return { saved: false };
}
