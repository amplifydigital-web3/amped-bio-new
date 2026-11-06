/**
 * Creator 18+ setup, people who appear and releases (adult content review 5.1 to 5.3,
 * 6.1 and 7.4, PR R4). The database, identity checks and the edge are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const s: Record<string, Row[]> = {
    profiles: [],
    people: [],
    links: [],
    items: [],
    cases: [],
    events: [],
    users: [],
  };
  const hex = (v: any) => (v ? Buffer.from(v).toString("hex") : null);
  const eq = (a: any, b: any) =>
    a instanceof Uint8Array || b instanceof Uint8Array ? hex(a) === hex(b) : a === b;
  const match = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (
        value &&
        typeof value === "object" &&
        !(value instanceof Uint8Array) &&
        !(value instanceof Date)
      ) {
        if ("in" in value) return value.in.some((v: any) => eq(row[key], v));
        if ("not" in value) return value.not === null ? row[key] != null : !eq(row[key], value.not);
        if ("startsWith" in value) return String(row[key]).startsWith(value.startsWith);
      }
      return eq(row[key] ?? null, value);
    });
  const table = (name: string, defaults: Row = {}) => ({
    findUnique: vi.fn(async ({ where }: any) => s[name]!.find(r => match(r, where)) ?? null),
    findFirst: vi.fn(async ({ where }: any) => s[name]!.find(r => match(r, where)) ?? null),
    findMany: vi.fn(async ({ where }: any = {}) => s[name]!.filter(r => match(r, where))),
    count: vi.fn(async ({ where }: any) => s[name]!.filter(r => match(r, where)).length),
    create: vi.fn(async ({ data }: any) => {
      const row = { createdAt: new Date(), ...defaults, ...data };
      s[name]!.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) =>
      Object.assign(s[name]!.find(r => match(r, where))!, data)
    ),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const rows = s[name]!.filter(r => match(r, where));
      rows.forEach(r => Object.assign(r, data));
      return { count: rows.length };
    }),
    delete: vi.fn(async ({ where }: any) => {
      s[name]!.splice(
        s[name]!.findIndex(r => match(r, where)),
        1
      );
    }),
    deleteMany: vi.fn(async ({ where }: any) => {
      s[name] = s[name]!.filter(r => !match(r, where));
    }),
  });
  const prisma: any = {
    creatorAdultProfile: table("profiles", {
      enabledAt: null,
      disabledAt: null,
      disabledBy: null,
      policyVersion: null,
      custodianName: null,
    }),
    appearingPerson: table("people", {
      personUserId: null,
      releaseAt: null,
      creatorSignedAt: null,
      withdrawnAt: null,
      releaseVersion: null,
    }),
    contentItemPerson: table("links"),
    contentItem: table("items"),
    safetyCase: table("cases", { state: "OPEN" }),
    safetyEvent: table("events"),
    user: table("users"),
  };
  prisma.$transaction = vi.fn(async (fn: any) => fn(prisma));
  return { prisma, s };
});
const identity = vi.hoisted(() => ({ checkIdentity: vi.fn() }));
const edge = vi.hoisted(() => ({
  hideItems: vi.fn(async () => ({ synced: [], pending: [] })),
  syncEdge: vi.fn(async () => ({ applied: 0, unchanged: 0, failed: 0 })),
  edgeDirty: vi.fn(() => ({ edgeDirtyAt: new Date() })),
}));

vi.mock("@repo/database", () => ({
  prisma: db.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("../services/identity/checks", () => identity);
vi.mock("../services/content/edge", () => edge);

import {
  countersign,
  disableAdult,
  enableAdult,
  getSetup,
  invitePerson,
  acceptPolicy,
  setCustodian,
  setItemPeople,
  signRelease,
  submitBlocker,
  submitForReview,
  surfaceAllowed,
  withdrawRelease,
} from "../services/safety/adultSetup";

const PASS = { pass: true, tier: "STANDARD", validUntil: new Date(Date.now() + 86_400_000) };
const ITEM = Buffer.alloc(16, 1);
const options = {
  surfaces: ["store" as const],
  otherPlatforms: { kind: "none" as const },
  faceShown: true,
  tagAllowed: false,
  payment: { kind: "share" as const, bps: 2000 },
};

async function readyCreator() {
  await acceptPolicy(7);
  await setCustodian(7, { name: "Maya Lin", address: "1 Main St, Boston" });
  await enableAdult(7);
}

async function readyPerson() {
  const invite = await invitePerson(7, "Sam");
  const token = invite.link.split("/appear/")[1]!;
  await signRelease({ token, options, legalName: "Sam Doe" }, 20);
  await countersign(7, invite.id);
  return invite.id;
}

beforeEach(() => {
  for (const key of Object.keys(db.s)) db.s[key] = [];
  identity.checkIdentity.mockReset();
  identity.checkIdentity.mockResolvedValue(PASS);
  edge.hideItems.mockClear();
  edge.syncEdge.mockClear();
  db.s.users!.push({ id: 7, name: "Maya", handle: "maya" });
  db.s.items!.push({
    id: ITEM,
    publicId: "item000000000001",
    userId: 7,
    adult: true,
    aiLabel: null,
    status: "READY",
    publishState: "PUBLISHED",
  });
});

describe("setup (5.1)", () => {
  it("turns on only when every step passes, and stores the custodian encrypted", async () => {
    identity.checkIdentity.mockImplementation(async (_id: number, kind: string) =>
      kind === "seller" ? { pass: false, reason: "no_name" } : PASS
    );
    await acceptPolicy(7);
    await setCustodian(7, { name: "Maya Lin", address: "1 Main St, Boston" });
    await expect(enableAdult(7)).rejects.toMatchObject({ code: "bad_request" });
    expect(db.s.profiles![0]!.custodianName).not.toContain("Maya");
    identity.checkIdentity.mockResolvedValue(PASS);
    await enableAdult(7);
    expect((await getSetup(7)).enabled).toBe(true);
  });

  it("makes every 18+ item a draft when the creator turns it off", async () => {
    await readyCreator();
    expect(await disableAdult(7)).toEqual({ unpublished: 1 });
    expect(db.s.items![0]!.publishState).toBe("DRAFT");
    // The public page closes now; the loop's next reconcile is too late
    expect(edge.syncEdge).toHaveBeenCalledWith(["item000000000001"]);
  });
});

describe("releases (5.2)", () => {
  it("is Ready only after the person signs with an Over 18 pass and the creator countersigns", async () => {
    const invite = await invitePerson(7, "Sam");
    expect(db.s.people![0]!.inviteHash).toHaveLength(64);
    const token = invite.link.split("/appear/")[1]!;
    await expect(signRelease({ token, options, legalName: "Maya" }, 7)).rejects.toMatchObject({
      code: "forbidden",
    });
    identity.checkIdentity.mockResolvedValueOnce({ pass: false, reason: "not_shared" });
    await expect(signRelease({ token, options, legalName: "Sam Doe" }, 20)).rejects.toMatchObject({
      code: "forbidden",
    });
    await signRelease({ token, options, legalName: "Sam Doe" }, 20);
    const person = db.s.people![0]!;
    expect(person).toMatchObject({ personUserId: 20, releaseVersion: "1" });
    // The filled text names the performer, so it is encrypted like the legal name
    expect(person.releaseText).not.toContain("Sam Doe");
    expect(person.releaseHash).toHaveLength(64);
    expect(person.releaseName).not.toContain("Sam");
    await expect(signRelease({ token, options, legalName: "Sam Doe" }, 20)).rejects.toMatchObject({
      code: "conflict",
    });
    await countersign(7, invite.id);
    expect(person.creatorSignedAt).toBeInstanceOf(Date);
  });
});

describe("items and review (5.3, 6.1)", () => {
  it("refuses submit until every rule passes, then opens an 18+ review and one setup check", async () => {
    expect(await submitBlocker(7, "item000000000001")).toBe("adult_off");
    await readyCreator();
    expect(await submitBlocker(7, "item000000000001")).toBe("ai_label_missing");
    const unsigned = await invitePerson(7, "Lee");
    await expect(
      setItemPeople(7, {
        publicId: "item000000000001",
        people: [{ personId: unsigned.id, productionDates: ["2026-10-01"] }],
        aiLabel: false,
      })
    ).rejects.toMatchObject({ code: "bad_request" });
    const ready = await readyPerson();
    await setItemPeople(7, {
      publicId: "item000000000001",
      people: [{ personId: ready, productionDates: ["2026-10-01"] }],
      aiLabel: false,
    });
    expect(await submitBlocker(7, "item000000000001")).toBeNull();
    expect(await submitForReview(7, "item000000000001", false)).toEqual({
      ok: false,
      error: "confirmation_missing",
    });
    expect(await submitForReview(7, "item000000000001", true)).toEqual({ ok: true });
    expect(db.s.items![0]).toMatchObject({
      moderationState: "HELD",
      moderationReason: "adult_review",
    });
    expect(db.s.cases!.map(c => c.type)).toEqual(["ADULT_REVIEW", "ADULT_SETUP"]);
    await submitForReview(7, "item000000000001", true);
    expect(db.s.cases!.filter(c => c.type === "ADULT_SETUP")).toHaveLength(1);
  });

  it("does not let a blocked item back into review", async () => {
    await readyCreator();
    db.s.items![0]!.moderationState = "BLOCKED";
    expect(await submitBlocker(7, "item000000000001")).toBe("item_blocked");
    expect(await submitForReview(7, "item000000000001", true)).toEqual({
      ok: false,
      error: "item_blocked",
    });
    expect(db.s.items![0]!.moderationState).toBe("BLOCKED");
  });

  it("allows a surface only when every tagged release allows it", async () => {
    await readyCreator();
    const ready = await readyPerson();
    await setItemPeople(7, {
      publicId: "item000000000001",
      people: [{ personId: ready, productionDates: ["2026-10-01"] }],
      aiLabel: true,
    });
    expect(await surfaceAllowed(ITEM, "store")).toBe(true);
    expect(await surfaceAllowed(ITEM, "memberships")).toBe(false);
    expect(await surfaceAllowed(ITEM, "content")).toBe(true);
    // An older release version must be signed again before it allows anything
    db.s.people!.find(person => person.releaseAt !== null)!.releaseVersion = "0";
    expect(await surfaceAllowed(ITEM, "store")).toBe(false);
  });
});

describe("withdraw consent (7.4)", () => {
  it("hides every item the release covers and opens a case for each", async () => {
    await readyCreator();
    const ready = await readyPerson();
    await setItemPeople(7, {
      publicId: "item000000000001",
      people: [{ personId: ready, productionDates: ["2026-10-01"] }],
      aiLabel: false,
    });
    await expect(withdrawRelease(21, ready)).rejects.toMatchObject({ code: "not_found" });
    expect(await withdrawRelease(20, ready)).toEqual({ hidden: 1 });
    expect(edge.hideItems).toHaveBeenCalledWith(["item000000000001"], "withdrawn");
    expect(db.s.cases).toMatchObject([{ type: "TAKE_IT_DOWN" }]);
    expect(await surfaceAllowed(ITEM, "store")).toBe(false);
    // A second tap withdraws nothing and opens no second case
    expect(await withdrawRelease(20, ready)).toEqual({ hidden: 0 });
    expect(db.s.cases).toHaveLength(1);
  });
});
