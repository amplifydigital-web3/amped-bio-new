import { prisma, type Prisma } from "@repo/database";
import {
  OFFER_PLACEMENTS,
  PURCHASE_ACCESS_STATUSES,
  SERVICE_ORDER_VALID_DAYS,
  type FulfillmentState,
  type OfferPlacement,
  type Storefront,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { isFeatureOn } from "../featureFlags";
import { recordMerchantAudit } from "./audit";
import { checkMerchant } from "./check";

/**
 * Service offers (Build Board #66, AB-2; docs/features/authbase-storefront.md 3.3 and 3.4).
 * A merchant's product: an Offer with merchantId, kind service, external fulfillment and a
 * placement. The merchant runs the service after payment, so it writes no Library entry. A paid
 * order stays open for SERVICE_ORDER_VALID_DAYS through the offer's access period, which also
 * stops a second purchase while one is unused (spec 3.4 guard).
 */

export class MerchantOfferError extends Error {}

const IN_FLIGHT = ["submitting", "submitted"];

export type MerchantOfferInput = {
  merchantId: Buffer;
  actorId: number;
  id?: Buffer;
  code: string;
  title: string;
  description?: string | null;
  features: string[];
  tag?: string | null;
  amountUnits: bigint;
  rank: number;
  status: "draft" | "active" | "paused" | "archived";
  placement?: OfferPlacement;
};

export async function upsertMerchantOffer(input: MerchantOfferInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,32}$/.test(code))
    throw new MerchantOfferError("Use a product code of 2 to 32 letters.");
  const title = input.title.trim();
  if (title.length < 2 || title.length > 80) throw new MerchantOfferError("Enter a title.");
  if (input.features.length > 4) throw new MerchantOfferError("Use at most four feature lines.");
  if (input.amountUnits <= 0n) throw new MerchantOfferError("Enter a price above zero.");
  const placement = input.placement ?? "rns_identity";
  if (!OFFER_PLACEMENTS.includes(placement)) throw new MerchantOfferError("Unknown placement.");

  // A merchant offer belongs to the merchant's first Owner account, which never shows it in a
  // creator store (creator queries filter merchantId: null)
  const owner = await prisma.merchantMember.findFirst({
    where: { merchantId: input.merchantId, role: "owner" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) throw new MerchantOfferError("Add an Owner to the merchant first.");

  const data = {
    title,
    description: input.description?.trim() || null,
    features: input.features.map(f => f.trim()).filter(Boolean) as Prisma.InputJsonValue,
    tag: input.tag?.trim() || null,
    externalCode: code,
    amountUnits: input.amountUnits,
    rank: input.rank,
    status: input.status,
    placement,
    activatedAt: input.status === "active" ? new Date() : undefined,
  };

  if (input.id) {
    const existing = await prisma.offer.findUnique({ where: { id: input.id } });
    if (
      !existing ||
      !existing.merchantId ||
      !Buffer.from(existing.merchantId).equals(input.merchantId)
    ) {
      throw new MerchantOfferError("Product not found.");
    }
    if (existing.status === "archived")
      throw new MerchantOfferError("An archived product is final.");
    await prisma.offer.update({ where: { id: input.id }, data });
    await recordMerchantAudit(input.merchantId, input.actorId, "product.updated", {
      code,
      amountUnits: input.amountUnits.toString(),
      status: input.status,
    });
    return { id: input.id.toString("hex") };
  }
  const id = uuidv7();
  await prisma.offer.create({
    data: {
      id,
      creatorUserId: owner.userId,
      merchantId: input.merchantId,
      kind: "service",
      fulfillment: "external",
      slug: `${code.toLowerCase().replace(/_/g, "-")}-${id.toString("hex").slice(-6)}`,
      accessPeriodDays: SERVICE_ORDER_VALID_DAYS,
      ...data,
    },
  });
  await recordMerchantAudit(input.merchantId, input.actorId, "product.created", {
    code,
    amountUnits: input.amountUnits.toString(),
  });
  return { id: id.toString("hex") };
}

export async function listMerchantOffers(merchantId: Buffer) {
  const rows = await prisma.offer.findMany({
    where: { merchantId },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(o => ({
    id: Buffer.from(o.id).toString("hex"),
    code: o.externalCode,
    title: o.title,
    description: o.description,
    features: (o.features as string[] | null) ?? [],
    tag: o.tag,
    amountUnits: o.amountUnits.toString(),
    rank: o.rank,
    status: o.status,
    placement: o.placement,
    salesCount: o.salesCount,
  }));
}

/**
 * The storefront for a placement (boards s1, s2, s4): the active offers of the merchant that
 * sells there, whether it can take payments now, and the viewer's latest order. Null while the
 * authbaseStorefront flag is off or nothing is for sale, so the tab keeps its old link.
 */
export async function storefront(
  placement: OfferPlacement,
  viewerUserId: number | null,
  now = new Date()
): Promise<Storefront> {
  if (!isFeatureOn("authbaseStorefront")) return null;
  const offers = await prisma.offer.findMany({
    where: {
      placement,
      status: "active",
      merchantId: { not: null },
      fulfillment: "external",
      adult: false,
    },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    include: { merchant: { select: { id: true, name: true, storePolicyUrl: true } } },
  });
  const first = offers.find(o => o.merchant);
  if (!first?.merchant) return null;
  const merchant = first.merchant;
  const mine = offers.filter(
    o => o.merchant && Buffer.from(o.merchant.id).equals(Buffer.from(merchant.id))
  );
  const [gate, latest] = await Promise.all([
    checkMerchant(merchant.id, { screen: false }),
    viewerUserId
      ? prisma.purchase.findFirst({
          where: {
            buyerUserId: viewerUserId,
            merchantId: Buffer.from(merchant.id),
            status: { in: [...PURCHASE_ACCESS_STATUSES, ...IN_FLIGHT] },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            offerId: true,
            status: true,
            fulfillmentState: true,
            softConfirmedAt: true,
            accessUntil: true,
          },
        })
      : Promise.resolve(null),
  ]);
  const latestOffer = latest?.offerId
    ? mine.find(o => Buffer.from(o.id).equals(Buffer.from(latest.offerId!)))
    : null;
  return {
    merchant: {
      id: Buffer.from(merchant.id).toString("hex"),
      name: merchant.name,
      storePolicyUrl: merchant.storePolicyUrl,
      takingPayments: gate.pass,
    },
    feeBps: gate.pass ? gate.feeBps : 0,
    offers: mine.map(o => ({
      id: Buffer.from(o.id).toString("hex"),
      code: o.externalCode,
      title: o.title,
      description: o.description,
      features: ((o.features as string[] | null) ?? []).slice(0, 4),
      tag: o.tag,
      amountUnits: o.amountUnits.toString(),
      rank: o.rank,
    })),
    latestOrder:
      latest && latest.offerId && (!latest.accessUntil || latest.accessUntil > now)
        ? {
            purchaseId: Buffer.from(latest.id).toString("hex"),
            offerId: Buffer.from(latest.offerId).toString("hex"),
            code: latestOffer?.externalCode ?? null,
            status: latest.status,
            fulfillmentState: (latest.fulfillmentState as FulfillmentState | null) ?? null,
            paidAt: latest.softConfirmedAt?.toISOString() ?? null,
          }
        : null,
  };
}
