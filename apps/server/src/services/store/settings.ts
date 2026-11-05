/**
 * Store settings and the go live checklist (C9; content spec 3.8, store-catalog.md 1 and 2,
 * store policy 3.5). A store is created on first open, in draft. It goes live only when all
 * seven steps pass, checked again on the server at setLive.
 */
import { isAddress } from "viem";
import { prisma } from "@repo/database";
import {
  GO_LIVE_STEPS,
  STORE_SECTIONS,
  type GoLiveChecklist,
  type GoLiveState,
  type GoLiveStep,
  type StoreSettingsUpdate,
} from "@repo/constants";
import { uuidv7 } from "../../utils/uuid-v7";
import { checkIdentity } from "../identity/checks";
import { isFeatureOn } from "../featureFlags";

export class StoreError extends Error {
  constructor(
    readonly code: string,
    readonly detail: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = "StoreError";
  }
}

export async function ensureStore(userId: number) {
  const existing = await prisma.storeSettings.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.storeSettings.create({
      data: {
        id: uuidv7(),
        userId,
        sectionOrder: [...STORE_SECTIONS],
        featuredOfferIds: [],
      },
    });
  } catch (error) {
    // Two first opens at once: the other one created it
    if ((error as { code?: string })?.code === "P2002") {
      return prisma.storeSettings.findUniqueOrThrow({ where: { userId } });
    }
    throw error;
  }
}

/**
 * Step 7 (store policy 3.5, SP-Q32). R4 (feat/adult-setup) replaces this stub with the
 * CreatorAdultProfile rule. Until then a store with an 18+ product can't pass, and C9 refuses
 * to activate 18+ products, so the step reads not_required.
 */
export async function adultSetupStep(creatorUserId: number): Promise<GoLiveState> {
  const adult = await prisma.offer.count({
    where: { creatorUserId, adult: true, status: "active" },
  });
  return adult ? "todo" : "not_required";
}

/** The seven steps in store-catalog.md section 2 order. fresh re-runs the seller check. */
export async function goLiveChecklist(
  userId: number,
  opts: { fresh?: boolean } = {}
): Promise<GoLiveChecklist> {
  const [store, user, activeProducts, seller, adult] = await Promise.all([
    ensureStore(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email_verified: true, wallet: { select: { address: true } } },
    }),
    prisma.offer.count({ where: { creatorUserId: userId, status: "active" } }),
    checkIdentity(userId, "seller", { fresh: opts.fresh }),
    adultSetupStep(userId),
  ]);
  const state: Record<GoLiveStep, { state: GoLiveState; reason?: string | null }> = {
    terms: { state: store.sellerTermsAcceptedAt ? "done" : "todo" },
    wallet: {
      state: user?.wallet?.address && isAddress(user.wallet.address) ? "done" : "todo",
    },
    email: { state: user?.email_verified ? "done" : "todo" },
    // Membership plans count once MB-1 adds them
    product: { state: activeProducts > 0 ? "done" : "todo" },
    seller: {
      state: seller.pass ? "done" : "todo",
      reason: seller.pass ? null : seller.reason,
    },
    policy: { state: store.livePolicyVersionId ? "done" : "todo" },
    adult: { state: adult },
  };
  return GO_LIVE_STEPS.map(step => ({ step, ...state[step] }));
}

export function checklistPasses(list: GoLiveChecklist): boolean {
  return list.every(row => row.state !== "todo");
}

/** True when fans can see the store: live, and store sales switched on. */
export function storeIsPublic(store: { status: string } | null): boolean {
  return store?.status === "live" && isFeatureOn("storeSales");
}

export async function getStore(userId: number) {
  const store = await ensureStore(userId);
  const checklist = await goLiveChecklist(userId);
  return {
    status: store.status as "draft" | "live" | "paused",
    name: store.name,
    tagline: store.tagline,
    layout: store.layout,
    sectionOrder: store.sectionOrder as string[],
    featuredOfferIds: store.featuredOfferIds as string[],
    about: store.about,
    thankYouNote: store.thankYouNote,
    sellerTermsAccepted: Boolean(store.sellerTermsAcceptedAt),
    wentLiveAt: store.wentLiveAt?.toISOString() ?? null,
    salesOn: isFeatureOn("storeSales"),
    checklist,
  };
}

export async function updateStore(userId: number, input: StoreSettingsUpdate) {
  await ensureStore(userId);
  if (input.featuredOfferIds?.length) {
    const ids = [...new Set(input.featuredOfferIds)];
    const owned = await prisma.offer.count({
      where: {
        creatorUserId: userId,
        id: { in: ids.map(id => Buffer.from(id, "hex")) },
        status: { not: "archived" },
      },
    });
    if (owned !== ids.length) throw new StoreError("featured_not_yours");
    input = { ...input, featuredOfferIds: ids };
  }
  if (input.sectionOrder) input = { ...input, sectionOrder: [...new Set(input.sectionOrder)] };
  const blank = (value: string | null | undefined) =>
    value === undefined ? undefined : value?.trim() ? value.trim() : null;
  await prisma.storeSettings.update({
    where: { userId },
    data: {
      name: blank(input.name),
      tagline: blank(input.tagline),
      layout: input.layout,
      sectionOrder: input.sectionOrder,
      featuredOfferIds: input.featuredOfferIds,
      about: blank(input.about),
      thankYouNote: blank(input.thankYouNote),
    },
  });
  return getStore(userId);
}

export async function acceptSellerTerms(userId: number, now = new Date()) {
  await ensureStore(userId);
  await prisma.storeSettings.updateMany({
    where: { userId, sellerTermsAcceptedAt: null },
    data: { sellerTermsAcceptedAt: now },
  });
  return getStore(userId);
}

/** Live needs every step, run fresh. Pause hides the store and stops new sales; buyers keep access. */
export async function setLive(userId: number, live: boolean, now = new Date()) {
  const store = await ensureStore(userId);
  if (!live) {
    if (store.status === "live") {
      await prisma.storeSettings.update({ where: { userId }, data: { status: "paused" } });
    }
    return getStore(userId);
  }
  const checklist = await goLiveChecklist(userId, { fresh: true });
  const failing = checklist.find(row => row.state === "todo");
  if (failing)
    throw new StoreError("go_live_incomplete", { step: failing.step, reason: failing.reason });
  await prisma.storeSettings.update({
    where: { userId },
    data: { status: "live", wentLiveAt: store.wentLiveAt ?? now },
  });
  return getStore(userId);
}
