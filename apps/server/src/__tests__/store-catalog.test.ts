/**
 * Store catalog (content PR 9, C9): store policy, products, go live, the public reads and offer
 * targets on checkout. The database is an in memory fake; identity checks, payment settings,
 * feature flags and covers are mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  seller: { pass: true } as { pass: boolean; reason?: string },
  storeSales: true,
}));

function eq(a: unknown, b: unknown) {
  // A column the fake row never set reads as null, like the database (merchantId, AB-2)
  if (b === null) return a === null || a === undefined;
  if (Buffer.isBuffer(a) || a instanceof Uint8Array) {
    return (Buffer.isBuffer(b) || b instanceof Uint8Array) && Buffer.from(a).equals(Buffer.from(b));
  }
  return a === b;
}

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "creatorUserId_slug")
      return row.creatorUserId === cond.creatorUserId && row.slug === cond.slug;
    if (key === "creatorUserId_version")
      return row.creatorUserId === cond.creatorUserId && row.version === cond.version;
    const value = row[key];
    if (
      cond &&
      typeof cond === "object" &&
      !Buffer.isBuffer(cond) &&
      !(cond instanceof Date) &&
      !(cond instanceof Uint8Array)
    ) {
      if ("in" in cond) return cond.in.some((c: unknown) => eq(value, c));
      if ("not" in cond) return !eq(value, cond.not);
      if ("gte" in cond) return value >= cond.gte;
      return true;
    }
    return eq(value, cond);
  });
}

function table(name: string) {
  state.tables[name] ??= [];
  return state.tables[name]!;
}

function model(name: string, defaults: Row = {}) {
  const rows = () => table(name);
  const unique = (where: Row) => rows().find(r => matches(r, where)) ?? null;
  return {
    findUnique: vi.fn(async ({ where }: Row) => unique(where)),
    findUniqueOrThrow: vi.fn(async ({ where }: Row) => unique(where)!),
    findFirst: vi.fn(async ({ where, orderBy }: Row) => {
      let list = rows().filter(r => matches(r, where));
      if (orderBy) {
        const [field, dir] = Object.entries(orderBy)[0] as [string, string];
        list = [...list].sort((a, b) => (a[field] > b[field] ? 1 : -1) * (dir === "desc" ? -1 : 1));
      }
      return list[0] ?? null;
    }),
    findMany: vi.fn(async ({ where }: Row = {}) => rows().filter(r => matches(r, where))),
    count: vi.fn(async ({ where }: Row = {}) => rows().filter(r => matches(r, where)).length),
    create: vi.fn(async ({ data }: Row) => {
      const { items, ...rest } = data;
      if (name === "storeSettings" && rows().some(r => r.userId === rest.userId)) {
        throw Object.assign(new Error("dup"), { code: "P2002" });
      }
      const row = { ...defaults, createdAt: new Date(), updatedAt: new Date(), ...rest };
      rows().push(row);
      if (items?.create)
        for (const item of items.create) table("offerItem").push({ ...item, offerId: row.id });
      return row;
    }),
    update: vi.fn(async ({ where, data }: Row) => {
      const row = unique(where)!;
      const { items, ...rest } = data;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) row[k] = v;
      if (items?.create)
        for (const item of items.create) table("offerItem").push({ ...item, offerId: row.id });
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: Row) => {
      const list = rows().filter(r => matches(r, where));
      list.forEach(r => Object.assign(r, data));
      return { count: list.length };
    }),
    deleteMany: vi.fn(async ({ where }: Row) => {
      const keep = rows().filter(r => !matches(r, where));
      const count = rows().length - keep.length;
      state.tables[name] = keep;
      return { count };
    }),
  };
}

vi.mock("@repo/database", () => {
  const prisma: Row = {
    storeSettings: model("storeSettings", {
      status: "draft",
      layout: "grid",
      name: null,
      tagline: null,
      about: null,
      thankYouNote: null,
      policyDraft: null,
      livePolicyVersionId: null,
      sellerTermsAcceptedAt: null,
      wentLiveAt: null,
    }),
    offer: model("offer", {
      adult: false,
      salesCount: 0,
      activatedAt: null,
      alsoInMembership: false,
    }),
    offerItem: model("offerItem"),
    storePolicyVersion: model("storePolicyVersion"),
    user: model("user"),
    contentItem: model("contentItem"),
    contentAsset: model("contentAsset"),
    checkoutIntent: model("checkoutIntent"),
    // MB-2: plans for the checklist, the policy section and Also in membership
    membershipPlan: model("membershipPlan"),
    membership: model("membership"),
  };
  // Offers load with their items and each item's content row
  const plainFindMany = prisma.offer.findMany;
  prisma.offer.findMany = vi.fn(async (args: Row) => {
    const offers = await plainFindMany(args);
    return offers
      .sort((a: Row, b: Row) => a.sortOrder - b.sortOrder)
      .map((offer: Row) => ({
        ...offer,
        items: table("offerItem")
          .filter(i => eq(i.offerId, offer.id))
          .sort((a, b) => a.position - b.position)
          .map(i => ({
            ...i,
            contentItem: table("contentItem").find(c => eq(c.id, i.contentItemId)),
          })),
      }));
  });
  const offerFindUnique = prisma.offer.findUnique;
  prisma.offer.findUnique = vi.fn(async (args: Row) => {
    const offer = await offerFindUnique(args);
    if (!offer || !args.select?.creator) return offer;
    const creator = table("user").find(u => u.id === offer.creatorUserId)!;
    return {
      ...offer,
      creator: {
        ...creator,
        storeSettings: table("storeSettings").find(s => s.userId === creator.id) ?? null,
      },
      items: table("offerItem")
        .filter(i => eq(i.offerId, offer.id))
        .map(i => ({ contentItem: table("contentItem").find(c => eq(c.id, i.contentItemId)) })),
    };
  });
  const userFindUnique = prisma.user.findUnique;
  prisma.user.findUnique = vi.fn(async (args: Row) => {
    const user = await userFindUnique(args);
    return user
      ? { ...user, wallet: user.walletAddress ? { address: user.walletAddress } : null }
      : null;
  });
  const itemFindMany = prisma.offerItem.findMany;
  prisma.offerItem.findMany = vi.fn(async (args: Row) =>
    (await itemFindMany(args)).map((row: Row) => ({
      ...row,
      contentItem: table("contentItem").find(c => eq(c.id, row.contentItemId)),
    }))
  );
  prisma.$transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
  return { prisma };
});

vi.mock("../services/identity/checks", () => ({
  checkIdentity: vi.fn(async () => state.seller),
}));
vi.mock("../services/payments/settings", () => ({
  paymentSettings: vi.fn(async () => ({
    oneTimePriceMin: 500_000n,
    oneTimePriceMax: 1_000_000_000n,
    platformFeeBps: 500,
  })),
}));
vi.mock("../services/featureFlags", () => ({
  isFeatureOn: vi.fn((key: string) => (key === "storeSales" ? state.storeSales : true)),
}));
vi.mock("../services/content/delivery", () => ({
  buildProductCover: vi.fn(() => ({
    src: "https://media.test/cover.webp",
    srcSet: "",
    width: 640,
    height: 640,
  })),
}));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn(async () => null) }));

import {
  assertPublishable,
  publishPolicy,
  renderDraft,
  saveDraft,
  StorePolicyError,
} from "../services/store/policy";
import {
  acceptSellerTerms,
  goLiveChecklist,
  setLive,
  updateStore,
} from "../services/store/settings";
import { OfferError, setOfferStatus, upsertOffer } from "../services/store/products";
import { prisma } from "@repo/database";
import {
  storeForBio,
  storeForBioByHandle,
  storePolicyPublic,
  storeProductPublic,
  storePublic,
} from "../services/store/public";
import { resolveTarget } from "../services/checkout/intents";
import { DEFAULT_STORE_POLICY_DRAFT, type StorePolicyDraft } from "@repo/constants";

const MAYA = 10;
const FAN = 20;
const NOW = new Date("2026-11-03T12:00:00Z");

function item(publicId: string, extra: Row = {}) {
  return {
    id: Buffer.from(publicId.padEnd(16, "0").slice(0, 16)),
    publicId,
    userId: MAYA,
    kind: "VIDEO",
    title: `Item ${publicId}`,
    durationMs: 60_000,
    pageCount: null,
    status: "READY",
    publishState: "PUBLISHED",
    moderationState: "CLEAR",
    deletedAt: null,
    adult: false,
    ...extra,
  };
}

const offerInput = (extra: Row = {}) => ({
  kind: "single" as const,
  title: "Episode 4",
  slug: "episode-4",
  description: null,
  amountUnits: "3000000",
  accessPeriodDays: null,
  alsoInMembership: false,
  itemPublicIds: ["vid1"],
  coverItemPublicId: null,
  ...extra,
});

async function readyStore() {
  await acceptSellerTerms(MAYA, NOW);
  await publishPolicy(MAYA, NOW);
  const offer = await upsertOffer(MAYA, offerInput());
  await setOfferStatus(MAYA, offer.id, "active");
  return offer;
}

beforeEach(() => {
  state.tables = {
    user: [
      {
        id: MAYA,
        handle: "maya",
        name: "Maya Lin",
        email_verified: true,
        walletAddress: "0x1111111111111111111111111111111111111111",
        block: "no",
        page_status: "PUBLISHED",
        image: null,
        image_file_id: null,
        theme: null,
      },
      {
        id: FAN,
        handle: "fan",
        name: "Fan",
        email_verified: true,
        walletAddress: null,
        block: "no",
        page_status: "PUBLISHED",
      },
    ],
    contentItem: [
      item("vid1"),
      item("vid2"),
      item("adult1", { adult: true }),
      item("draft1", { publishState: "DRAFT" }),
    ],
  };
  state.seller = { pass: true };
  state.storeSales = true;
});

describe("store policy", () => {
  it("renders the standard template with the creator's fields and no section 9", () => {
    const { sellerName, text } = renderDraft(
      {
        ...DEFAULT_STORE_POLICY_DRAFT,
        standard: { refund: { option: "B", days: 7 }, email: "maya@example.com" },
      },
      { id: MAYA, handle: "maya", name: "Maya Lin" },
      "Maya's Shop",
      NOW
    );
    expect(sellerName).toBe("Maya Lin");
    expect(text).toContain("**Maya's Shop Store Policy**");
    expect(text).toContain("Effective 3 Nov 2026");
    expect(text).toContain("This store is run by Maya Lin (@maya).");
    expect(text).toContain("You may ask for a refund within 7 days");
    expect(text).not.toContain("Option A");
    expect(text).toContain("Contact me through Amped messages or maya@example.com.");
    expect(text).not.toContain("## 9.");
    expect(text).not.toMatch(/\{\{/);
  });

  it("uses a legal name when the creator picks one", () => {
    const draft: StorePolicyDraft = {
      ...DEFAULT_STORE_POLICY_DRAFT,
      seller: { source: "legal", legalName: "Lin Studio LLC" },
    };
    expect(
      renderDraft(draft, { id: MAYA, handle: "maya", name: "Maya Lin" }, null, NOW).sellerName
    ).toBe("Lin Studio LLC");
  });

  it("refuses a custom policy with an outside link or a missing confirmation", () => {
    const custom = (text: string, confirmations: string[]) =>
      ({
        ...DEFAULT_STORE_POLICY_DRAFT,
        mode: "custom",
        custom: { text, confirmations },
      }) as StorePolicyDraft;
    const all = ["names_seller", "age", "licence", "refunds", "memberships"];
    const code = (draft: StorePolicyDraft) => {
      try {
        assertPublishable(draft, "Maya");
        return null;
      } catch (error) {
        return (error as StorePolicyError).code;
      }
    };
    expect(code(custom("Pay me on paypal [dot] me/maya", all))).toBe("policy_external_link");
    expect(code(custom("Write to maya@example.com or see amped.bio/maya", all))).toBeNull();
    expect(code(custom("My policy.", all.slice(1)))).toBe("policy_confirmations_missing");
    expect(code(custom("   ", all))).toBe("policy_empty");
    expect(code(DEFAULT_STORE_POLICY_DRAFT)).toBeNull();
    expect(() => assertPublishable(DEFAULT_STORE_POLICY_DRAFT, "")).toThrow(StorePolicyError);
  });

  it("publishes numbered versions, at most 10 a day", async () => {
    expect(await publishPolicy(MAYA, NOW)).toMatchObject({ version: 1 });
    await saveDraft(MAYA, {
      ...DEFAULT_STORE_POLICY_DRAFT,
      standard: { refund: { option: "B", days: 14 }, email: null },
    });
    expect(await publishPolicy(MAYA, NOW)).toMatchObject({ version: 2 });
    const versions = table("storePolicyVersion");
    expect(versions.map(v => v.version)).toEqual([1, 2]);
    expect(versions[1]!.settings).toMatchObject({
      sellerName: "Maya Lin",
      refund: { option: "B", days: 14 },
    });
    const store = table("storeSettings")[0]!;
    expect(Buffer.from(store.livePolicyVersionId).equals(Buffer.from(versions[1]!.id))).toBe(true);
    for (let i = 0; i < 8; i++) await publishPolicy(MAYA, NOW);
    await expect(publishPolicy(MAYA, NOW)).rejects.toMatchObject({ code: "policy_rate_limited" });
  });
});

describe("products", () => {
  it("saves a single product as a draft with its item and amount", async () => {
    const offer = await upsertOffer(MAYA, offerInput());
    expect(offer).toMatchObject({
      status: "draft",
      slug: "episode-4",
      amountUnits: "3000000",
      itemCount: 1,
    });
    expect(offer.items).toEqual([{ publicId: "vid1", title: "Item vid1", kind: "video" }]);
  });

  it("refuses bad products with the right code", async () => {
    const code = async (input: Row) => {
      try {
        await upsertOffer(MAYA, offerInput(input) as never);
        return null;
      } catch (error) {
        return (error as OfferError).code;
      }
    };
    expect(await code({ itemPublicIds: ["vid1", "vid2"] })).toBe("single_one_item");
    expect(await code({ amountUnits: "499999" })).toBe("amount_range");
    expect(await code({ amountUnits: "1000000001" })).toBe("amount_range");
    expect(await code({ itemPublicIds: ["adult1"] })).toBe("item_adult");
    expect(await code({ itemPublicIds: ["draft1"] })).toBe("item_not_ready");
    expect(await code({ itemPublicIds: ["nope"] })).toBe("item_not_ready");
    expect(await code({ alsoInMembership: true })).toBe("no_plan");
    expect(await code({ slug: "policy" })).toBe("slug_taken");
    await upsertOffer(MAYA, offerInput());
    expect(await code({ title: "Other" })).toBe("slug_taken");
    expect(
      await code({ kind: "bundle", slug: "both", itemPublicIds: ["vid1", "vid2"] })
    ).toBeNull();
  });

  it("another creator's item can't go in a product", async () => {
    table("contentItem").push(item("theirs", { userId: 99 }));
    await expect(
      upsertOffer(MAYA, offerInput({ itemPublicIds: ["theirs"] }))
    ).rejects.toMatchObject({
      code: "item_not_ready",
    });
  });

  it("activating needs a published policy and a fresh seller pass", async () => {
    const offer = await upsertOffer(MAYA, offerInput());
    await expect(setOfferStatus(MAYA, offer.id, "active")).rejects.toMatchObject({
      code: "policy",
    });
    await publishPolicy(MAYA, NOW);
    state.seller = { pass: false, reason: "name_not_linked" };
    await expect(setOfferStatus(MAYA, offer.id, "active")).rejects.toMatchObject({
      code: "seller",
      detail: { reason: "name_not_linked" },
    });
    state.seller = { pass: true };
    expect(await setOfferStatus(MAYA, offer.id, "active")).toMatchObject({ status: "active" });
  });

  it("archive is final and drops the product from featured", async () => {
    const offer = await readyStore();
    await updateStore(MAYA, { featuredOfferIds: [offer.id] });
    await setOfferStatus(MAYA, offer.id, "archived");
    expect(table("storeSettings")[0]!.featuredOfferIds).toEqual([]);
    await expect(setOfferStatus(MAYA, offer.id, "active")).rejects.toMatchObject({
      code: "archived",
    });
    await expect(upsertOffer(MAYA, offerInput({ id: offer.id }))).rejects.toMatchObject({
      code: "archived",
    });
  });

  it("an archive that lands between the read and the write still wins", async () => {
    const offer = await readyStore();
    await setOfferStatus(MAYA, offer.id, "archived");
    // The status change read the row before the archive was written
    const row = table("offer")[0]!;
    vi.mocked(prisma.offer.findUnique).mockResolvedValueOnce({ ...row, status: "paused" } as never);
    await expect(setOfferStatus(MAYA, offer.id, "paused")).rejects.toMatchObject({
      code: "archived",
    });
    expect(row.status).toBe("archived");
  });

  it("a slug taken by a concurrent save is refused as slug_taken", async () => {
    await readyStore();
    vi.mocked(prisma.offer.create).mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "P2002" })
    );
    await expect(upsertOffer(MAYA, offerInput({ slug: "other" }))).rejects.toMatchObject({
      code: "slug_taken",
    });
  });
});

describe("go live", () => {
  it("lists the seven steps and goes live only when each passes", async () => {
    let list = await goLiveChecklist(MAYA);
    expect(list.map(r => [r.step, r.state])).toEqual([
      ["terms", "todo"],
      ["wallet", "done"],
      ["email", "done"],
      ["product", "todo"],
      ["seller", "done"],
      ["policy", "todo"],
      ["adult", "not_required"],
    ]);
    await expect(setLive(MAYA, true, NOW)).rejects.toMatchObject({
      code: "go_live_incomplete",
      detail: { step: "terms" },
    });
    await readyStore();
    list = await goLiveChecklist(MAYA);
    expect(list.every(r => r.state !== "todo")).toBe(true);
    state.seller = { pass: false, reason: "unavailable" };
    await expect(setLive(MAYA, true, NOW)).rejects.toMatchObject({ detail: { step: "seller" } });
    state.seller = { pass: true };
    expect(await setLive(MAYA, true, NOW)).toMatchObject({ status: "live" });
    expect(await setLive(MAYA, false, NOW)).toMatchObject({ status: "paused" });
  });
});

describe("public store", () => {
  it("is not found until live with sales on, except to the owner as a preview", async () => {
    const offer = await readyStore();
    expect(await storePublic("maya", null, NOW)).toBeNull();
    expect(await storePublic("maya", MAYA, NOW)).toMatchObject({ preview: true });
    await setLive(MAYA, true, NOW);
    state.storeSales = false;
    expect(await storePublic("maya", FAN, NOW)).toBeNull();
    state.storeSales = true;
    const store = await storePublic("maya", null, NOW);
    expect(store).toMatchObject({
      handle: "maya",
      name: "Maya Lin",
      sellerName: "Maya Lin",
      preview: false,
      buyingHere: { policyVersion: 1 },
    });
    expect(store!.buyingHere.summary).toBe(
      "You buy from Maya Lin. Sales are final. If an item does not open or is not as described, message me within 7 days."
    );
    expect(store!.products.map(p => p.id)).toEqual([offer.id]);
    expect(JSON.stringify(store)).not.toMatch(/0x1111|email|walletAddress|"id":10/);

    const product = await storeProductPublic("maya", "episode-4", null, NOW);
    expect(product).toMatchObject({ title: "Episode 4", sellerName: "Maya Lin", policyVersion: 1 });
    expect(await storeProductPublic("maya", "missing", null, NOW)).toBeNull();
  });

  it("drops a product whose item became 18+ or unpublished", async () => {
    await readyStore();
    await setLive(MAYA, true, NOW);
    table("contentItem").find(c => c.publicId === "vid1")!.publishState = "DRAFT";
    expect((await storePublic("maya", null, NOW))!.products).toEqual([]);
  });

  it("shows the current policy while live, and past versions only to the owner", async () => {
    await readyStore();
    await publishPolicy(MAYA, NOW);
    expect(await storePolicyPublic("maya", undefined, null)).toBeNull();
    await setLive(MAYA, true, NOW);
    expect(await storePolicyPublic("maya", undefined, null)).toMatchObject({
      version: 2,
      current: true,
    });
    expect(await storePolicyPublic("maya", 1, null)).toBeNull();
    expect(await storePolicyPublic("maya", 1, MAYA)).toMatchObject({ version: 1, current: false });
  });
});

describe("store block (st10)", () => {
  const maya = { id: MAYA, handle: "maya", name: "Maya Lin" };

  it("hides until the store is live with sales on, never showing the owner's preview", async () => {
    await readyStore();
    expect(await storeForBio(maya, NOW)).toBeNull();
    await setLive(MAYA, true, NOW);
    state.storeSales = false;
    expect(await storeForBio(maya, NOW)).toBeNull();
    state.storeSales = true;
    expect(await storeForBio(maya, NOW)).toMatchObject({
      handle: "maya",
      name: "Maya Lin",
      productCount: 1,
    });
    expect(await storeForBioByHandle("maya", NOW)).toMatchObject({ productCount: 1 });
  });

  it("puts featured products first, caps the row at 6 and counts every product", async () => {
    await readyStore();
    const ids: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const offer = await upsertOffer(
        MAYA,
        offerInput({ slug: `extra-${i}`, title: `Extra ${i}`, itemPublicIds: ["vid2"] })
      );
      await setOfferStatus(MAYA, offer.id, "active");
      ids.push(offer.id);
    }
    await updateStore(MAYA, { featuredOfferIds: [ids[6]!] });
    await setLive(MAYA, true, NOW);
    const block = await storeForBio(maya, NOW);
    expect(block!.productCount).toBe(8);
    expect(block!.products).toHaveLength(6);
    expect(block!.products[0]!.id).toBe(ids[6]);
    expect(new Set(block!.products.map(p => p.id)).size).toBe(6);
  });

  it("hides when no product is left to sell", async () => {
    await readyStore();
    await setLive(MAYA, true, NOW);
    table("contentItem").find(c => c.publicId === "vid1")!.adult = true;
    expect(await storeForBio(maya, NOW)).toBeNull();
  });
});

describe("checkout offer targets", () => {
  it("resolves an active product in a public store with its amount and path", async () => {
    const offer = await readyStore();
    expect(await resolveTarget({ type: "offer", id: offer.id })).toBeNull();
    await setLive(MAYA, true, NOW);
    expect(await resolveTarget({ type: "offer", id: offer.id })).toMatchObject({
      creatorUserId: MAYA,
      item: { title: "Episode 4", creatorHandle: "maya" },
      extra: { path: "/maya/store/episode-4", amountUnits: 3_000_000n, kind: "single" },
    });
    await setOfferStatus(MAYA, offer.id, "paused");
    expect(await resolveTarget({ type: "offer", id: offer.id })).toBeNull();
    expect(await resolveTarget({ type: "offer", id: "zz" })).toBeNull();
  });
});
