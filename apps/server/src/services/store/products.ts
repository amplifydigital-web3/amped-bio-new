/**
 * Store products (C9; content spec 3.8 "Products", store-catalog.md 1, 3 and 6). A product is
 * an Offer of one item (single) or up to 50 (bundle), sold for a fixed amount in USDC.
 *
 * Activating needs a verified seller (fresh check, S1 and S4) and a published store policy.
 * 18+ items can't be sold until adult setup ships (R4): the product refuses with item_adult.
 * Writing the paid rule onto the items is the gating engine's paid kind (G4); until then the
 * items keep the visibility the creator gave them.
 */
import { prisma, type Prisma } from "@repo/database";
import {
  STORE_LIMITS,
  type OfferRefusal,
  type OfferStatus,
  type OfferUpsertInput,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { checkIdentity } from "../identity/checks";
import { paymentSettings } from "../payments/settings";
import { assetServable } from "../content/access";
import { buildProductCover } from "../content/delivery";
import { fromDbKind } from "../content/ids";

export class OfferError extends Error {
  constructor(
    readonly code: OfferRefusal,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = "OfferError";
  }
}

export const offerIdToHex = (id: Uint8Array) => Buffer.from(id).toString("hex");
const hexToId = (hex: string) => Buffer.from(hex, "hex");

/** Items a product may hold: the creator's own, published, ready, cleared and not deleted. */
const SELLABLE_ITEM_WHERE = {
  status: "READY",
  publishState: "PUBLISHED",
  moderationState: "CLEAR",
  deletedAt: null,
} as const;

/** The amount bounds in force: the spec's 0.50 to 1,000 USDC, narrowed by the payment settings. */
export async function amountBounds() {
  const settings = await paymentSettings();
  const min =
    settings.oneTimePriceMin > STORE_LIMITS.amountMinUnits
      ? settings.oneTimePriceMin
      : STORE_LIMITS.amountMinUnits;
  const max =
    settings.oneTimePriceMax < STORE_LIMITS.amountMaxUnits
      ? settings.oneTimePriceMax
      : STORE_LIMITS.amountMaxUnits;
  return { min, max, feeBps: settings.platformFeeBps };
}

async function resolveItems(userId: number, publicIds: string[]) {
  const unique = [...new Set(publicIds)];
  const items = await prisma.contentItem.findMany({
    where: { userId, publicId: { in: unique } },
    select: {
      id: true,
      publicId: true,
      status: true,
      publishState: true,
      moderationState: true,
      deletedAt: true,
      adult: true,
    },
  });
  const byId = new Map(items.map(item => [item.publicId, item]));
  const ordered = unique.map(publicId => byId.get(publicId));
  if (ordered.some(item => !item)) throw new OfferError("item_not_ready");
  for (const item of ordered) {
    if (
      item!.status !== SELLABLE_ITEM_WHERE.status ||
      item!.publishState !== SELLABLE_ITEM_WHERE.publishState ||
      item!.moderationState !== SELLABLE_ITEM_WHERE.moderationState ||
      item!.deletedAt !== null
    ) {
      throw new OfferError("item_not_ready", { publicId: item!.publicId });
    }
    if (item!.adult) throw new OfferError("item_adult", { publicId: item!.publicId });
  }
  return ordered.map(item => item!);
}

/** Creates or edits a product. A new product starts as a draft; editing keeps the status. */
export async function upsertOffer(userId: number, input: OfferUpsertInput) {
  if (input.kind === "single" && input.itemPublicIds.length !== 1) {
    throw new OfferError("single_one_item");
  }
  if (input.itemPublicIds.length > STORE_LIMITS.bundleItems) throw new OfferError("bundle_full");
  const amount = BigInt(input.amountUnits);
  const bounds = await amountBounds();
  if (amount < bounds.min || amount > bounds.max) {
    throw new OfferError("amount_range", {
      min: bounds.min.toString(),
      max: bounds.max.toString(),
    });
  }
  // Also in membership (MB-2): members open the product's items too; needs a plan
  if (input.alsoInMembership) {
    const plan = await prisma.membershipPlan.findUnique({
      where: { creatorUserId: userId },
      select: { id: true },
    });
    if (!plan) throw new OfferError("no_plan");
  }

  const items = await resolveItems(userId, input.itemPublicIds);
  const cover = input.coverItemPublicId
    ? items.find(item => item.publicId === input.coverItemPublicId)
    : items[0];

  const existing = input.id
    ? await prisma.offer.findUnique({ where: { id: hexToId(input.id) } })
    : null;
  if (input.id && (!existing || existing.creatorUserId !== userId)) {
    throw new OfferError("item_not_ready");
  }
  if (existing?.status === "archived") throw new OfferError("archived");

  // /{handle}/store/policy is the policy page
  if (input.slug === "policy") throw new OfferError("slug_taken");
  const clash = await prisma.offer.findUnique({
    where: { creatorUserId_slug: { creatorUserId: userId, slug: input.slug } },
    select: { id: true },
  });
  if (clash && (!existing || !Buffer.from(clash.id).equals(Buffer.from(existing.id)))) {
    throw new OfferError("slug_taken");
  }

  const id = existing ? Buffer.from(existing.id) : uuidv7();
  const data = {
    kind: input.kind,
    slug: input.slug,
    title: input.title,
    description: input.description?.trim() || null,
    coverItemId: cover ? Buffer.from(cover.id) : null,
    amountUnits: amount,
    accessPeriodDays: input.accessPeriodDays,
    alsoInMembership: input.alsoInMembership,
    adult: false,
  };
  const itemRows = items.map((item, position) => ({
    id: uuidv7(),
    contentItemId: Buffer.from(item.id),
    position,
  }));
  if (existing) {
    // Removing an item from a bundle with buyers in access is refused with C10 (Purchase reads)
    await prisma.$transaction([
      prisma.offerItem.deleteMany({ where: { offerId: id } }),
      prisma.offer.update({
        where: { id },
        data: { ...data, items: { create: itemRows } },
      }),
    ]);
  } else {
    const last = await prisma.offer.findFirst({
      where: { creatorUserId: userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await prisma.offer.create({
      data: {
        id,
        creatorUserId: userId,
        status: "draft",
        sortOrder: (last?.sortOrder ?? -1) + 1,
        ...data,
        items: { create: itemRows },
      },
    });
  }
  return getOffer(userId, offerIdToHex(id));
}

/** Activate needs the seller check (fresh) and a published policy; archive is final. */
export async function setOfferStatus(userId: number, idHex: string, status: OfferStatus) {
  const offer = await prisma.offer.findUnique({ where: { id: hexToId(idHex) } });
  if (!offer || offer.creatorUserId !== userId) throw new OfferError("item_not_ready");
  if (offer.status === "archived" && status !== "archived") throw new OfferError("archived");
  if (status === "active" && offer.status !== "active") {
    if (offer.adult) throw new OfferError("item_adult");
    const store = await prisma.storeSettings.findUnique({
      where: { userId },
      select: { livePolicyVersionId: true },
    });
    if (!store?.livePolicyVersionId) throw new OfferError("policy");
    const seller = await checkIdentity(userId, "seller", { fresh: true });
    if (!seller.pass) throw new OfferError("seller", { reason: seller.reason });
    // Items may have changed since save
    const items = await prisma.offerItem.findMany({
      where: { offerId: offer.id },
      select: { contentItem: { select: { publicId: true } } },
    });
    await resolveItems(
      userId,
      items.map(row => row.contentItem.publicId)
    );
  }
  // An archived product can't be featured
  if (status === "archived") await unfeature(userId, idHex);
  await prisma.offer.update({
    where: { id: offer.id },
    data: {
      status,
      activatedAt: status === "active" ? (offer.activatedAt ?? new Date()) : offer.activatedAt,
    },
  });
  return getOffer(userId, idHex);
}

async function unfeature(userId: number, idHex: string) {
  const store = await prisma.storeSettings.findUnique({
    where: { userId },
    select: { featuredOfferIds: true },
  });
  const featured = (store?.featuredOfferIds as string[] | undefined) ?? [];
  if (featured.includes(idHex)) {
    await prisma.storeSettings.update({
      where: { userId },
      data: { featuredOfferIds: featured.filter(id => id !== idHex) },
    });
  }
}

export async function reorderOffers(userId: number, ids: string[]) {
  const offers = await prisma.offer.findMany({
    where: { creatorUserId: userId, id: { in: ids.map(hexToId) } },
    select: { id: true },
  });
  if (offers.length !== new Set(ids).size) throw new OfferError("item_not_ready");
  await prisma.$transaction(
    ids.map((id, sortOrder) =>
      prisma.offer.update({ where: { id: hexToId(id) }, data: { sortOrder } })
    )
  );
  return listOffers(userId);
}

type OfferWithItems = Awaited<ReturnType<typeof loadOffers>>[number];

function loadOffers(where: Prisma.OfferWhereInput) {
  return prisma.offer.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          contentItem: {
            select: {
              id: true,
              publicId: true,
              kind: true,
              title: true,
              durationMs: true,
              pageCount: true,
              adult: true,
              status: true,
              publishState: true,
              moderationState: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  });
}

/** Covers for many products at once: one asset query. */
async function coversFor(offers: OfferWithItems[], now: Date) {
  const coverItems = offers.flatMap(offer => {
    const pick =
      (offer.coverItemId &&
        offer.items.find(row =>
          Buffer.from(row.contentItem.id).equals(Buffer.from(offer.coverItemId!))
        )) ||
      offer.items[0];
    return pick ? [{ offerId: offerIdToHex(offer.id), item: pick.contentItem }] : [];
  });
  if (!coverItems.length) return new Map<string, ReturnType<typeof buildProductCover>>();
  const assets = await prisma.contentAsset.findMany({
    where: {
      contentItemId: { in: coverItems.map(entry => Buffer.from(entry.item.id)) },
      role: { in: ["COVER", "BLUR"] },
    },
  });
  const map = new Map<string, ReturnType<typeof buildProductCover>>();
  for (const { offerId, item } of coverItems) {
    const rows = assets
      .filter(asset => Buffer.from(asset.contentItemId).equals(Buffer.from(item.id)))
      .filter(assetServable);
    map.set(offerId, buildProductCover({ ...item, allowDownload: false }, rows, now));
  }
  return map;
}

function cardOf(offer: OfferWithItems, cover: ReturnType<typeof buildProductCover> | undefined) {
  return {
    id: offerIdToHex(offer.id),
    slug: offer.slug,
    kind: offer.kind as "single" | "bundle",
    title: offer.title,
    amountUnits: offer.amountUnits.toString(),
    accessPeriodDays: offer.accessPeriodDays,
    itemCount: offer.items.length,
    cover: cover ?? null,
    itemKinds: [...new Set(offer.items.map(row => fromDbKind(row.contentItem.kind)))],
    alsoInMembership: offer.alsoInMembership,
  };
}

/** The creator's Products tab, every status, with the facts each row needs. */
export async function listOffers(userId: number, now = new Date()) {
  const offers = await loadOffers({ creatorUserId: userId });
  const covers = await coversFor(offers, now);
  return offers.map(offer => ({
    ...cardOf(offer, covers.get(offerIdToHex(offer.id))),
    status: offer.status as OfferStatus,
    description: offer.description,
    adult: offer.adult,
    salesCount: offer.salesCount,
    /** An item that stopped being sellable since save */
    needsAttention: offer.items.some(
      row =>
        row.contentItem.status !== "READY" ||
        row.contentItem.publishState !== "PUBLISHED" ||
        row.contentItem.moderationState !== "CLEAR" ||
        row.contentItem.deletedAt !== null
    ),
    items: offer.items.map(row => ({
      publicId: row.contentItem.publicId,
      title: row.contentItem.title,
      kind: fromDbKind(row.contentItem.kind),
    })),
    coverItemPublicId:
      offer.items.find(
        row =>
          offer.coverItemId &&
          Buffer.from(row.contentItem.id).equals(Buffer.from(offer.coverItemId))
      )?.contentItem.publicId ?? null,
  }));
}

export async function getOffer(userId: number, idHex: string) {
  const all = await listOffers(userId);
  const offer = all.find(row => row.id === idHex);
  if (!offer) throw new OfferError("item_not_ready");
  return offer;
}

/**
 * Active products a fan may see, in the creator's order. Never 18+ (store-catalog 3: listed only
 * after an age pass, which A1 builds) and never one whose items stopped being sellable.
 */
export async function publicOffers(creatorUserId: number, now = new Date(), slug?: string) {
  const offers = (
    await loadOffers({
      creatorUserId,
      status: "active",
      adult: false,
      ...(slug ? { slug } : {}),
    })
  ).filter(offer =>
    offer.items.every(
      row =>
        !row.contentItem.adult &&
        row.contentItem.status === "READY" &&
        row.contentItem.publishState === "PUBLISHED" &&
        row.contentItem.moderationState === "CLEAR" &&
        row.contentItem.deletedAt === null
    )
  );
  const covers = await coversFor(offers, now);
  return offers.map(offer => ({
    card: cardOf(offer, covers.get(offerIdToHex(offer.id))),
    description: offer.description,
    items: offer.items.map(row => ({
      publicId: row.contentItem.publicId,
      kind: fromDbKind(row.contentItem.kind),
      title: row.contentItem.title,
      durationMs: row.contentItem.durationMs,
      pageCount: row.contentItem.pageCount,
    })),
  }));
}
