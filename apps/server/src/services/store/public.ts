/**
 * Public store reads (C9; content spec 3.8, store-catalog.md 2, 3 and 6, store policy 3.4).
 *
 * A store is public when it is live and store sales are switched on. Before that only its owner
 * sees it, marked preview. Outputs select explicit fields: no email, wallet or numeric id.
 * 18+ products never appear (A1 lists them after an age pass).
 */
import { prisma } from "@repo/database";
import type { StoreProductPublic, StorePublic, StoreSection } from "@repo/constants";
import { findPublicCreator } from "../content/publicView";
import { publicOffers } from "./products";
import { liveVersion, publicPolicy, versionSummary } from "./policy";
import { storeIsPublic } from "./settings";

async function visibleStore(handle: string, viewerUserId: number | null) {
  const creator = await findPublicCreator(handle);
  if (!creator) return null;
  const store = await prisma.storeSettings.findUnique({ where: { userId: creator.id } });
  if (!store) return null;
  const isOwner = viewerUserId === creator.id;
  const isPublic = storeIsPublic(store);
  if (!isPublic && !isOwner) return null;
  const live = await liveVersion(creator.id);
  // No policy, no store: every fan surface names the seller and the policy
  if (!live && !isOwner) return null;
  return { creator, store, isOwner, preview: !isPublic, live };
}

export async function storePublic(
  handle: string,
  viewerUserId: number | null,
  now = new Date()
): Promise<StorePublic | null> {
  const found = await visibleStore(handle, viewerUserId);
  if (!found) return null;
  const { creator, store, preview, live } = found;
  const offers = await publicOffers(creator.id, now);
  const cards = offers.map(offer => offer.card);
  const featuredIds = (store.featuredOfferIds as string[]) ?? [];
  const summary = live ? versionSummary(live) : null;
  const sellerName = summary?.sellerName ?? creator.name ?? `@${creator.handle}`;
  return {
    handle: creator.handle,
    name: store.name ?? creator.name ?? `@${creator.handle}`,
    sellerName,
    tagline: store.tagline,
    avatar: creator.image,
    layout: store.layout as StorePublic["layout"],
    sectionOrder: store.sectionOrder as StoreSection[],
    about: store.about,
    featured: featuredIds.flatMap(id => cards.filter(card => card.id === id)),
    products: cards,
    buyingHere: {
      summary: summary?.summary ?? "",
      policyVersion: summary?.version ?? 0,
    },
    preview,
  };
}

export async function storeProductPublic(
  handle: string,
  slug: string,
  viewerUserId: number | null,
  now = new Date()
): Promise<StoreProductPublic | null> {
  const found = await visibleStore(handle, viewerUserId);
  if (!found) return null;
  const [offer] = await publicOffers(found.creator.id, now, slug);
  if (!offer) return null;
  const summary = found.live ? versionSummary(found.live) : null;
  return {
    ...offer.card,
    handle: found.creator.handle,
    sellerName: summary?.sellerName ?? found.creator.name ?? `@${found.creator.handle}`,
    description: offer.description,
    items: offer.items,
    policyVersion: summary?.version ?? 0,
    preview: found.preview,
  };
}

export async function storePolicyPublic(
  handle: string,
  version: number | undefined,
  viewerUserId: number | null
) {
  const creator = await findPublicCreator(handle);
  if (!creator) return null;
  const store = await prisma.storeSettings.findUnique({
    where: { userId: creator.id },
    select: { status: true },
  });
  return publicPolicy(creator, {
    version,
    storeVisible: storeIsPublic(store),
    isOwner: viewerUserId === creator.id,
  });
}
