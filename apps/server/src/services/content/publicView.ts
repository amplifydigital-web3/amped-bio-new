/**
 * Public reads for content (Build Board #20, spec 3.7 and 3.10, PR 6): the cards
 * a content block shows, the creator feed page, the item page, and the sitemap.
 *
 * Every read goes through PUBLIC_ITEM_WHERE and PUBLIC_CREATOR_WHERE, so a
 * draft, a held or blocked item, a gated item, an 18+ item, a deleted item or a
 * suspended page never appears. Items with a served asset that has not passed
 * its scan are skipped as well. Outputs carry no email, wallet or numeric id.
 */
import { prisma, type ContentAsset, type ContentItem } from "@repo/database";
import {
  captionLabel,
  type ContentCard,
  type ContentFeedPage,
  type ContentPublicItem,
  type ContentUploadKind,
} from "@repo/constants";
import { getFileUrl } from "../../utils/fileUrlResolver";
import { PUBLIC_CREATOR_WHERE, PUBLIC_ITEM_WHERE, servedAssetsClean } from "./access";
import { buildCard, CARD_ASSET_ROLES } from "./delivery";
import { toDbKind } from "./ids";

export interface PublicCreator {
  id: number;
  handle: string;
  name: string | null;
  image: string | null;
}

/** The creator behind a public handle, or null when the page is not public. */
export async function findPublicCreator(handle: string): Promise<PublicCreator | null> {
  const user = await prisma.user.findFirst({
    where: { handle: handle.toLowerCase(), ...PUBLIC_CREATOR_WHERE },
    select: { id: true, handle: true, name: true, image: true, image_file_id: true },
  });
  if (!user?.handle) return null;
  const image = await getFileUrl({
    legacyImageField: user.image,
    imageFileId: user.image_file_id,
  }).catch(() => null);
  return { id: user.id, handle: user.handle.toLowerCase(), name: user.name, image: image ?? null };
}

type AssetRow = Pick<
  ContentAsset,
  | "contentItemId"
  | "role"
  | "storage"
  | "r2Key"
  | "streamUid"
  | "variant"
  | "lang"
  | "mimeType"
  | "width"
  | "height"
  | "scanStatus"
>;

/** Ids per query, so a page with many blocks does not send one huge query. */
const CARD_LOOKUP_CHUNK = 60;

/** Ids one page can hold: the same ceiling the content sitemap uses for a page. */
const CARD_LOOKUP_MAX = 1000;

async function assetsByItem(itemIds: Uint8Array[], roles?: readonly string[]) {
  const map = new Map<string, AssetRow[]>();
  if (!itemIds.length) return map;
  const rows: AssetRow[] = [];
  for (let start = 0; start < itemIds.length; start += CARD_LOOKUP_CHUNK) {
    const chunk = itemIds.slice(start, start + CARD_LOOKUP_CHUNK);
    rows.push(
      ...(await prisma.contentAsset.findMany({
        where: {
          contentItemId: { in: chunk.map(id => Buffer.from(id)) },
          ...(roles ? { role: { in: roles as never } } : {}),
        },
      }))
    );
  }
  for (const row of rows) {
    const key = Buffer.from(row.contentItemId).toString("hex");
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return map;
}

const hex = (id: Uint8Array) => Buffer.from(id).toString("hex");

/**
 * Cards for a page's content blocks, keyed by publicId. Ids that are not the
 * creator's public items are left out, so a block skips them (spec 3.7).
 *
 * The ids of every content block on the page are read, so they are looked up in
 * chunks: a page with more ids than one query takes still shows all its cards.
 */
export async function publicCardsFor(
  userId: number,
  publicIds: string[],
  now: Date = new Date()
): Promise<Record<string, ContentCard>> {
  const unique = [...new Set(publicIds)].slice(0, CARD_LOOKUP_MAX);
  if (!unique.length) return {};
  const items: ContentItem[] = [];
  for (let start = 0; start < unique.length; start += CARD_LOOKUP_CHUNK) {
    const chunk = unique.slice(start, start + CARD_LOOKUP_CHUNK);
    items.push(
      ...(await prisma.contentItem.findMany({
        where: { userId, publicId: { in: chunk }, ...PUBLIC_ITEM_WHERE },
      }))
    );
  }
  // Every asset, so a dirty one keeps the item off the page
  const assets = await assetsByItem(items.map(item => item.id));
  const cards: Record<string, ContentCard> = {};
  for (const item of items) {
    const rows = assets.get(hex(item.id)) ?? [];
    if (!servedAssetsClean(rows)) continue;
    cards[item.publicId] = buildCard(item, rows, now);
  }
  return cards;
}

/** True when the creator has at least one public item (the feed page is indexable). */
export async function hasPublicContent(userId: number): Promise<boolean> {
  const count = await prisma.contentItem.count({
    where: { userId, ...PUBLIC_ITEM_WHERE },
  });
  return count > 0;
}

/** The creator feed page: public items, newest first (spec 3.7, board cs6). */
export async function publicFeed(
  creator: PublicCreator,
  options: { kind?: ContentUploadKind; cursor?: string; limit: number },
  now: Date = new Date()
): Promise<ContentFeedPage> {
  let cursorOk = false;
  if (options.cursor) {
    const cursor = await prisma.contentItem.findUnique({
      where: { publicId: options.cursor },
      select: { userId: true },
    });
    cursorOk = cursor?.userId === creator.id;
  }
  const items: ContentItem[] = await prisma.contentItem.findMany({
    where: {
      userId: creator.id,
      ...PUBLIC_ITEM_WHERE,
      ...(options.kind ? { kind: toDbKind(options.kind) } : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    ...(cursorOk ? { cursor: { publicId: options.cursor! }, skip: 1 } : {}),
    take: options.limit + 1,
  });
  const page = items.slice(0, options.limit);
  const assets = await assetsByItem(page.map(item => item.id));
  const cards = page
    .filter(item => servedAssetsClean(assets.get(hex(item.id)) ?? []))
    .map(item =>
      buildCard(
        item,
        (assets.get(hex(item.id)) ?? []).filter(row =>
          (CARD_ASSET_ROLES as readonly string[]).includes(row.role)
        ),
        now
      )
    );
  return {
    creator: { handle: creator.handle, name: creator.name, image: creator.image },
    items: cards,
    nextCursor: items.length > options.limit ? page[page.length - 1]!.publicId : null,
  };
}

/** The item page: one public item of this creator, or null (spec 3.7). */
export async function publicItem(
  creator: PublicCreator,
  publicId: string,
  now: Date = new Date()
): Promise<ContentPublicItem | null> {
  const item = await prisma.contentItem.findFirst({
    where: { publicId, userId: creator.id, ...PUBLIC_ITEM_WHERE },
  });
  if (!item) return null;
  const rows = (await assetsByItem([item.id])).get(hex(item.id)) ?? [];
  if (!servedAssetsClean(rows)) return null;
  const chapters = Array.isArray(item.chapters)
    ? (item.chapters as Array<{ startMs?: unknown; title?: unknown }>)
        .filter(
          (chapter): chapter is { startMs: number; title: string } =>
            typeof chapter?.startMs === "number" && typeof chapter?.title === "string"
        )
        .map(chapter => ({ startMs: chapter.startMs, title: chapter.title }))
    : [];
  const captionLangs = rows
    .filter(row => row.role === "CAPTION" && row.lang)
    .map(row => row.lang!)
    .sort();
  const original = rows.find(row => row.role === "ORIGINAL");
  const documentFormat =
    item.kind !== "DOCUMENT"
      ? null
      : original?.mimeType === "application/epub+zip"
        ? ("epub" as const)
        : ("pdf" as const);
  return {
    ...buildCard(item, rows, now),
    description: item.description,
    chapters,
    captionLangs,
    documentFormat,
    creator: { handle: creator.handle, name: creator.name, image: creator.image },
  };
}

/** Captions an item offers, for the page's track list. */
export function captionTracks(langs: string[]) {
  return langs.map(lang => ({ lang, label: captionLabel(lang) }));
}

// ----------------------------------------------------------------------------
// Sitemap (spec decision 23): public items and the feed pages that hold them
// ----------------------------------------------------------------------------

const SITEMAP_WHERE = {
  ...PUBLIC_ITEM_WHERE,
  user: { ...PUBLIC_CREATOR_WHERE, handle: { not: null }, email_verified: true },
};

export async function contentSitemapCount(): Promise<number> {
  return prisma.contentItem.count({ where: SITEMAP_WHERE });
}

export async function contentSitemapEntries(page: number, pageSize: number) {
  const items = await prisma.contentItem.findMany({
    where: SITEMAP_WHERE,
    orderBy: { publishedAt: "asc" },
    skip: page * pageSize,
    take: pageSize,
    select: {
      publicId: true,
      kind: true,
      updatedAt: true,
      publishedAt: true,
      user: { select: { handle: true } },
    },
  });
  return items
    .filter(item => item.user.handle)
    .map(item => ({
      handle: item.user.handle!.toLowerCase(),
      publicId: item.publicId,
      lastModified: (item.updatedAt ?? item.publishedAt ?? new Date()).toISOString(),
    }));
}
