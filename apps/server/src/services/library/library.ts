/**
 * Fan Library reads and writes (Build Board #26, FL-2, spec 3.6). The router is
 * thin; the work is here so it can be tested without tRPC.
 *
 * Connected creators are the ones the fan follows or whose pool the fan stakes
 * in (published, not suspended); memberships and purchases join them in FL-7.
 * Every list pages over items the fan can open (access.ts, which asks the
 * gating engine for gated items since FL-6) and builds cards through the
 * public card builder, so covers are the only URLs a list returns. The Shop
 * lists locked cards: the blur cover and the rule summary, never media.
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
import { cardsForItems, lockedCardsForItems } from "../content/publicView";
import { toDbKind } from "../content/ids";
import { batchPoolFanCreatorIds } from "../follow/poolFans";
import {
  LIBRARY_CREATOR_WHERE,
  libraryDecisions,
  libraryGating,
  libraryItemWhere,
  libraryOpenAccess,
  type LibraryViewer,
} from "./access";
import { creatorMoneyStatus, moneyCreatorIds, moneyLabels } from "./money";

export type ItemWithCreator = ContentItem & { user: { page_status: string; block: string } };

export const ITEM_CREATOR_SELECT = { page_status: true, block: true } as const;

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
  theme: number | null;
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

export async function ownersFor(creatorIds: number[]): Promise<Map<number, OwnerInfo>> {
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

/**
 * Creators whose pool the fan stakes in (FL-6), public pages only. Read from
 * the stake mirror, as the engine does for a render; the fan's own pool is
 * left out.
 */
export async function poolCreatorIds(viewerId: number): Promise<number[]> {
  const rows = await prisma.stakedPool.findMany({
    where: {
      userWallet: { userId: viewerId },
      NOT: { stakeAmount: "0" },
      pool: { wallet: { user: LIBRARY_CREATOR_WHERE } },
    },
    take: LIBRARY_LIMITS.creatorsMax,
    select: { pool: { select: { wallet: { select: { userId: true } } } } },
  });
  return [...new Set(rows.map(row => row.pool.wallet.userId))].filter(id => id !== viewerId);
}

/** Followed creators, then pool creators the fan does not follow. */
export async function connectedCreatorIds(viewerId: number): Promise<number[]> {
  const [followed, pools, money] = await Promise.all([
    followedCreatorIds(viewerId),
    libraryGating() ? poolCreatorIds(viewerId) : Promise.resolve([]),
    // FL-7: a membership or a purchase connects the fan too (spec 2.1)
    moneyCreatorIds(viewerId),
  ]);
  const paid = [...money.members, ...money.purchased.keys()];
  const visible = paid.length
    ? (
        await prisma.user.findMany({
          where: { id: { in: paid }, ...LIBRARY_CREATOR_WHERE },
          select: { id: true },
        })
      ).map(user => user.id)
    : [];
  return [...new Set([...followed, ...visible, ...pools])]
    .filter(id => id !== viewerId)
    .slice(0, LIBRARY_LIMITS.creatorsMax);
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
export async function toLibraryItems(
  viewer: LibraryViewer,
  rows: ItemWithCreator[],
  extras?: ItemExtras,
  now: Date = new Date()
): Promise<LibraryItem[]> {
  const decisions = await libraryDecisions(viewer, rows);
  const allowed: Array<{
    row: ItemWithCreator;
    access: { source: LibraryItem["accessSource"]; planName: string | null };
  }> = [];
  for (const row of rows) {
    const decision = decisions.get(row.publicId);
    if (decision && "open" in decision) allowed.push({ row, access: decision.open });
  }
  if (!allowed.length) return [];
  const items = allowed.map(entry => entry.row);
  const [cards, owners, loaded, labels] = await Promise.all([
    cardsForItems(items, now),
    ownersFor(items.map(item => item.userId)),
    extras ? Promise.resolve(extras) : extrasFor(viewer.userId, items),
    // FL-7: Purchased and the plan name outrank how the item opened (decision 12)
    moneyLabels(viewer.userId, items, now),
  ]);
  const out: LibraryItem[] = [];
  for (const { row, access } of allowed) {
    const card = cards.get(row.publicId);
    const owner = owners.get(row.userId)?.owner;
    if (!card || !owner?.handle) continue;
    const key = hex(row.id);
    const label = labels.get(row.publicId);
    out.push({
      ...card,
      owner,
      accessSource: label?.source ?? access.source,
      planName: label ? label.planName : access.planName,
      progress: loaded.progress?.get(key) ?? null,
      savedAt: loaded.saved?.get(key)?.toISOString() ?? null,
    });
  }
  return out;
}

/** Newest first over listable items, paged by the last item's publicId. */
async function pageRows(
  where: Prisma.ContentItemWhereInput,
  cursor: string | undefined,
  limit: number = LIBRARY_LIMITS.page
): Promise<{ rows: ItemWithCreator[]; nextCursor: string | null }> {
  let cursorOk = false;
  if (cursor) {
    const at = await prisma.contentItem.findFirst({
      where: { publicId: cursor, ...where },
      select: { id: true },
    });
    cursorOk = !!at;
  }
  const rows = await prisma.contentItem.findMany({
    where: { ...libraryItemWhere(), ...where, user: LIBRARY_CREATOR_WHERE },
    include: { user: { select: ITEM_CREATOR_SELECT } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    ...(cursorOk ? { cursor: { publicId: cursor! }, skip: 1 } : {}),
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  return { rows: page, nextCursor: rows.length > limit ? page[page.length - 1]!.publicId : null };
}

/**
 * A page of items the fan can open. Rows the engine refuses drop out, so a
 * page can come back shorter than the limit; the cursor still moves on.
 */
async function pageItems(
  viewer: LibraryViewer,
  where: Prisma.ContentItemWhereInput,
  cursor: string | undefined,
  source?: LibraryItem["accessSource"]
): Promise<LibraryPage<LibraryItem>> {
  const page = await pageRows(where, cursor);
  const items = await toLibraryItems(viewer, page.rows);
  return {
    items: source ? items.filter(item => item.accessSource === source) : items,
    nextCursor: page.nextCursor,
  };
}

/** The Shop: listable items the fan can not open yet, each with its next step. */
async function pageShop(
  viewer: LibraryViewer,
  creatorId: number,
  cursor: string | undefined,
  now: Date = new Date()
): Promise<LibraryPage<LibraryShopItem>> {
  if (!libraryGating()) return { items: [], nextCursor: null };
  const page = await pageRows({ userId: creatorId, accessRuleId: { not: null } }, cursor);
  const decisions = await libraryDecisions(viewer, page.rows);
  const locked = page.rows.flatMap(row => {
    const decision = decisions.get(row.publicId);
    return decision && "locked" in decision ? [{ row, hint: decision.locked }] : [];
  });
  if (!locked.length) return { items: [], nextCursor: page.nextCursor };
  const [cards, owners] = await Promise.all([
    lockedCardsForItems(
      locked.map(entry => entry.row),
      now
    ),
    ownersFor([creatorId]),
  ]);
  const owner = owners.get(creatorId)?.owner;
  const items: LibraryShopItem[] = [];
  for (const { row, hint } of locked) {
    const card = cards.get(row.publicId);
    if (card && owner?.handle) items.push({ ...card, owner, unlockHint: hint });
  }
  return { items, nextCursor: page.nextCursor };
}

// ---------------------------------------------------------------- procedures

/** Continue: up to 12 unfinished items, last played first, access rechecked. */
export async function libraryContinue(
  viewer: LibraryViewer,
  handle?: string
): Promise<LibraryItem[]> {
  const creator = handle ? await creatorByHandle(handle) : null;
  if (handle && !creator) return [];
  const rows = await prisma.viewerProgress.findMany({
    where: {
      userId: viewer.userId,
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
    viewer,
    unfinished.map(row => row.contentItem)
  );
  return items.slice(0, LIBRARY_LIMITS.continueMax);
}

/** Newest from the creators the fan is connected to. */
export async function libraryNewest(
  viewer: LibraryViewer,
  input: {
    cursor?: string;
    type?: Parameters<typeof toDbKind>[0];
    source?: LibraryItem["accessSource"];
    where?: "everywhere" | "device";
    deviceIds?: string[];
  } = {}
): Promise<LibraryPage<LibraryItem>> {
  // Pool and follower sources need gating; Purchased and Membership are labels on items the
  // fan already opens (FL-7), so they filter the page like any other source
  if ((input.source === "pool" || input.source === "follower") && !libraryGating()) {
    return { items: [], nextCursor: null };
  }
  const creatorIds = await connectedCreatorIds(viewer.userId);
  if (!creatorIds.length) return { items: [], nextCursor: null };
  if (input.where === "device" && !input.deviceIds?.length) return { items: [], nextCursor: null };
  return pageItems(
    viewer,
    {
      userId: { in: creatorIds },
      ...(input.type ? { kind: toDbKind(input.type) } : {}),
      ...(input.where === "device" ? { publicId: { in: input.deviceIds } } : {}),
      ...(input.source === "public" ? { accessRuleId: null } : {}),
      ...(input.source === "pool" || input.source === "follower"
        ? { accessRuleId: { not: null } }
        : {}),
    },
    input.cursor,
    input.source
  );
}

function connectionFor(
  following: boolean,
  poolFan: boolean,
  money: { member: boolean; purchases: number } = { member: false, purchases: 0 }
): LibraryConnection {
  return { following, member: money.member, purchases: money.purchases, poolFan };
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
  const where = libraryItemWhere();
  const counts = await Promise.all(
    follows.map(async follow => {
      const since = visitedAt.get(follow.creatorId) ?? follow.followedAt;
      const count = await prisma.contentItem.count({
        where: { userId: follow.creatorId, ...where, publishedAt: { gt: since } },
      });
      return [follow.creatorId, count] as const;
    })
  );
  return new Map(counts);
}

/** Your creators: one row per followed creator, newest follow first. */
export async function libraryCreators(
  viewer: LibraryViewer,
  input: { cursor?: string; q?: string } = {}
): Promise<LibraryPage<LibraryCreatorRow>> {
  const viewerId = viewer.userId;
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
  const [owners, poolFans, counts, money] = await Promise.all([
    ownerInfo(page.map(row => row.creator)),
    batchPoolFanCreatorIds(creatorIds, viewerId),
    newCounts(
      viewerId,
      page.map(row => ({ creatorId: row.creator.id, followedAt: row.created_at }))
    ),
    moneyCreatorIds(viewerId),
  ]);
  const items: LibraryCreatorRow[] = [];
  for (const row of page) {
    const info = owners.get(row.creator.id);
    if (!info?.owner.handle) continue;
    items.push({
      owner: info.owner,
      connection: connectionFor(true, poolFans.has(row.creator.id), {
        member: money.members.has(row.creator.id),
        purchases: money.purchased.get(row.creator.id) ?? 0,
      }),
      newCount: counts.get(row.creator.id) ?? 0,
      pastDue: money.pastDue.has(row.creator.id),
    });
  }
  return {
    items,
    nextCursor: rows.length > LIBRARY_LIMITS.page ? String(page[page.length - 1]!.id) : null,
  };
}

/**
 * Yours and Shop counts for a section. With gating on, the newest listable
 * items (up to sectionCountScan) are decided in one batch; without it, Yours
 * is a count of public items and Shop is empty.
 */
async function sectionCounts(
  viewer: LibraryViewer,
  creatorId: number
): Promise<{ yours: number; shop: number }> {
  if (!libraryGating()) {
    const yours = await prisma.contentItem.count({
      where: { userId: creatorId, ...libraryItemWhere() },
    });
    return { yours, shop: 0 };
  }
  const rows = await prisma.contentItem.findMany({
    where: { userId: creatorId, ...libraryItemWhere(), user: LIBRARY_CREATOR_WHERE },
    include: { user: { select: ITEM_CREATOR_SELECT } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: LIBRARY_LIMITS.sectionCountScan,
  });
  const decisions = await libraryDecisions(viewer, rows);
  let yours = 0;
  let shop = 0;
  for (const decision of decisions.values()) {
    if (decision && "open" in decision) yours += 1;
    else if (decision && "locked" in decision) shop += 1;
  }
  return { yours, shop };
}

/** The fan's follow of this creator, and whether they stake in the creator's pool. */
async function connectionTo(viewerId: number, creatorId: number) {
  const [follow, poolFans, money] = await Promise.all([
    prisma.follow.findUnique({
      where: { follower_id_creator_id: { follower_id: viewerId, creator_id: creatorId } },
      select: { show_publicly: true, email_updates: true },
    }),
    batchPoolFanCreatorIds([creatorId], viewerId),
    creatorMoneyStatus(viewerId, creatorId),
  ]);
  const poolFan = poolFans.has(creatorId);
  // FL-7: any membership, current or ended, and any purchase keep the section open
  const paid = !!money.membership || money.purchases > 0;
  // A pool stake connects the fan only where gating can open pool items
  const connected =
    creatorId !== viewerId && (!!follow || paid || (poolFan && libraryGating()));
  return { follow, poolFan, connected, money };
}

/**
 * The creator section header (board m4). Opening it records the visit, which
 * resets the new count. Null when the creator's page is not public.
 */
export async function libraryCreator(
  viewer: LibraryViewer,
  handle: string,
  now: Date = new Date()
): Promise<LibraryCreatorHeader | null> {
  const creator = await creatorByHandle(handle);
  if (!creator) return null;
  const viewerId = viewer.userId;
  const [info, link] = await Promise.all([
    ownerInfo([creator]),
    connectionTo(viewerId, creator.id),
  ]);
  const counts = link.connected ? await sectionCounts(viewer, creator.id) : { yours: 0, shop: 0 };
  if (link.connected) {
    await prisma.libraryCreatorVisit.upsert({
      where: { userId_creatorId: { userId: viewerId, creatorId: creator.id } },
      create: { id: uuidv7(), userId: viewerId, creatorId: creator.id, lastVisitedAt: now },
      update: { lastVisitedAt: now },
    });
  }
  const owner = info.get(creator.id)!;
  return {
    connected: link.connected,
    owner: owner.owner,
    theme: owner.theme,
    connection: connectionFor(!!link.follow, link.poolFan, {
      member:
        !!link.money.membership &&
        link.money.membership.state !== "ended" &&
        !!link.money.membership.accessUntil,
      purchases: link.money.purchases,
    }),
    status: {
      membership: link.money.membership,
      purchases: { count: link.money.purchases },
      plan: link.money.plan,
      follow: link.follow
        ? { showPublicly: link.follow.show_publicly, emailUpdates: link.follow.email_updates }
        : null,
    },
    counts,
  };
}

/** Yours (newest; collections group it once bundles ship) or Shop (locked items, FL-6). */
export async function libraryCreatorItems(
  viewer: LibraryViewer,
  input: { handle: string; seg: "yours" | "shop"; cursor?: string }
): Promise<LibraryPage<LibraryItem> | LibraryPage<LibraryShopItem>> {
  const empty = { items: [], nextCursor: null };
  const creator = await creatorByHandle(input.handle);
  if (!creator || creator.id === viewer.userId) return empty;
  const link = await connectionTo(viewer.userId, creator.id);
  if (!link.connected) return empty;
  if (input.seg === "shop") return pageShop(viewer, creator.id, input.cursor);
  return pageItems(viewer, { userId: creator.id }, input.cursor);
}

/** Search titles and descriptions of items the fan can open, grouped by creator. */
export async function librarySearch(
  viewer: LibraryViewer,
  input: {
    q: string;
    scope: "all" | "creator" | "device";
    handle?: string;
    deviceIds?: string[];
    cursor?: string;
  }
): Promise<{ groups: LibrarySearchGroup[]; nextCursor: string | null }> {
  const empty = { groups: [], nextCursor: null };
  let creatorIds = await connectedCreatorIds(viewer.userId);
  if (input.scope === "creator") {
    const creator = input.handle ? await creatorByHandle(input.handle) : null;
    if (!creator || !creatorIds.includes(creator.id)) return empty;
    creatorIds = [creator.id];
  }
  if (!creatorIds.length) return empty;
  if (input.scope === "device" && !input.deviceIds?.length) return empty;
  const q = input.q.trim();
  const page = await pageItems(
    viewer,
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
  viewer: LibraryViewer,
  cursor?: string
): Promise<LibraryPage<LibraryItem>> {
  const viewerId = viewer.userId;
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
    viewer,
    page.map(row => row.contentItem)
  );
  return {
    items,
    nextCursor: rows.length > LIBRARY_LIMITS.page ? hex(page[page.length - 1]!.id) : null,
  };
}

export class LibraryNotFound extends Error {}

/** Saves an item the fan can open. Saving twice keeps the first save. */
export async function librarySave(
  viewer: LibraryViewer,
  publicId: string
): Promise<{ saved: true }> {
  const item = await prisma.contentItem.findUnique({
    where: { publicId },
    include: { user: { select: ITEM_CREATOR_SELECT } },
  });
  if (!item || !(await libraryOpenAccess(viewer, item))) throw new LibraryNotFound();
  await prisma.savedItem.upsert({
    where: { userId_contentItemId: { userId: viewer.userId, contentItemId: item.id } },
    create: { id: uuidv7(), userId: viewer.userId, contentItemId: item.id },
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

/**
 * Mark as watched (item menu, board m10). Ends the item's progress, so it
 * leaves Continue and plays from the start next time. Only items the fan can
 * open; unknown items are not found.
 */
export async function libraryMarkWatched(
  viewer: LibraryViewer,
  publicId: string,
  now: Date = new Date()
): Promise<{ ok: true }> {
  const viewerId = viewer.userId;
  const item = await prisma.contentItem.findUnique({
    where: { publicId },
    include: { user: { select: ITEM_CREATOR_SELECT } },
  });
  if (!item || !(await libraryOpenAccess(viewer, item))) throw new LibraryNotFound();
  const durationMs = item.durationMs ?? null;
  await prisma.viewerProgress.upsert({
    where: { userId_contentItemId: { userId: viewerId, contentItemId: item.id } },
    create: {
      id: uuidv7(),
      userId: viewerId,
      contentItemId: item.id,
      positionMs: durationMs ?? 0,
      durationMs,
      completed: true,
      lastPlayedAt: now,
    },
    update: { completed: true, positionMs: durationMs ?? undefined, lastPlayedAt: now },
  });
  return { ok: true };
}

/**
 * Remove from Continue (item menu, board m10). Forgets where the fan stopped:
 * the progress row is deleted, so the item plays from the start. Nothing else
 * changes. Unknown items and items with no progress are fine.
 */
export async function libraryRemoveFromContinue(
  viewerId: number,
  publicId: string
): Promise<{ ok: true }> {
  const item = await prisma.contentItem.findUnique({ where: { publicId }, select: { id: true } });
  if (item) {
    await prisma.viewerProgress.deleteMany({ where: { userId: viewerId, contentItemId: item.id } });
  }
  return { ok: true };
}
