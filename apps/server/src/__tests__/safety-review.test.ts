/**
 * Safety queue and case view (Build Board #28, adult content review 8.1, 8.2 and 8.5,
 * PR R2): who sees what, claims, reveals, decisions and escalation. The database,
 * the edge, media tokens, email, evidence and alerts are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const s = {
    cases: [] as Row[],
    events: [] as Row[],
    items: [] as Row[],
    assets: [] as Row[],
    users: [] as Row[],
    strikes: [] as Row[],
    profiles: [] as Row[],
    hashes: [] as Row[],
  };
  const hex = (v: any) => (v ? Buffer.from(v).toString("hex") : null);
  const eq = (a: any, b: any) =>
    a instanceof Uint8Array || b instanceof Uint8Array ? hex(a) === hex(b) : a === b;
  const match = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
        if ("in" in value) return value.in.some((v: any) => eq(row[key], v));
        if ("not" in value) return !eq(row[key], value.not);
        if ("lt" in value) return row[key] < value.lt;
        if ("gte" in value) return row[key] >= value.gte;
        if ("startsWith" in value) return String(row[key]).startsWith(value.startsWith);
      }
      return eq(row[key] ?? null, value);
    });
  const table = (rows: () => Row[]) => ({
    findUnique: vi.fn(async ({ where }: any) => rows().find(r => match(r, where)) ?? null),
    findFirst: vi.fn(async ({ where, orderBy }: any) => {
      let found = rows().filter(r => match(r, where));
      if (orderBy?.number === "desc")
        found = [...found].sort((a, b) => b.number.localeCompare(a.number));
      return found[0] ?? null;
    }),
    findMany: vi.fn(async ({ where, take }: any = {}) =>
      rows()
        .filter(r => match(r, where))
        .slice(0, take)
    ),
    count: vi.fn(async ({ where }: any) => rows().filter(r => match(r, where)).length),
    create: vi.fn(async ({ data }: any) => {
      const row = { createdAt: new Date(), ...data };
      rows().push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: any) =>
      Object.assign(rows().find(r => match(r, where))!, data)
    ),
  });
  const prisma: any = {
    safetyCase: table(() => s.cases),
    safetyEvent: table(() => s.events),
    contentItem: table(() => s.items),
    contentAsset: table(() => s.assets),
    user: table(() => s.users),
    strike: table(() => s.strikes),
    creatorAdultProfile: table(() => s.profiles),
    contentReport: { findMany: vi.fn(async () => []) },
    blockedContentHash: table(() => s.hashes),
    siteSettings: { findUnique: vi.fn(async () => null) },
  };
  for (const row of [s.cases]) void row;
  prisma.safetyCase.create = vi.fn(async ({ data }: any) => {
    const row = {
      state: "OPEN",
      assigneeId: null,
      claimedAt: null,
      createdAt: new Date(),
      ...data,
    };
    s.cases.push(row);
    return row;
  });
  return { prisma, s };
});

const edge = vi.hoisted(() => ({
  hideItems: vi.fn(async () => ({ synced: [], pending: [] })),
  restoreItems: vi.fn(async () => ({ synced: [], pending: [] })),
  syncEdge: vi.fn(async () => ({})),
  edgeStatus: vi.fn(async () => ({
    state: "BLOCKED",
    dirtySince: null,
    attempts: 0,
    lastError: null,
  })),
}));
const side = vi.hoisted(() => ({
  preserveEvidence: vi.fn(async () => ({ ok: true })),
  sendChildSafetyAlert: vi.fn(async () => ({ emails: 1, sms: 0, smsFailed: 0 })),
  deliverEmail: vi.fn(async () => ({})),
}));

vi.mock("@repo/database", () => ({
  prisma: db.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("../services/content/edge", () => edge);
vi.mock("../services/safety/evidence", () => ({ preserveEvidence: side.preserveEvidence }));
vi.mock("../services/safety/alert", () => ({ sendChildSafetyAlert: side.sendChildSafetyAlert }));
vi.mock("../utils/email/transport", () => ({ deliverEmail: side.deliverEmail }));
vi.mock("../services/cloudflare/mediaToken", () => ({
  signMediaToken: (payload: any) => `tok:${payload.a}:${payload.r}:${payload.exp}`,
  mediaUrl: (key: string, token: string) => `https://media.test/${key}?t=${token}`,
}));

import { openCase } from "../services/safety/cases";
import {
  claimCase,
  decideCase,
  escalateCase,
  getCase,
  listQueue,
  revealAsset,
} from "../services/safety/review";

const MOD = { id: 50, lead: false };
const LEAD = { id: 51, lead: true };
const ITEM_ID = Buffer.from("0102030405060708090a0b0c0d0e0f10", "hex");
const hex = (v: Uint8Array) => Buffer.from(v).toString("hex");

function seedItem(over: Record<string, unknown> = {}) {
  const item = {
    id: ITEM_ID,
    publicId: "abcdefghijklmnop",
    userId: 7,
    title: "Studio set",
    description: "desc",
    kind: "IMAGE",
    totalBytes: 10n,
    createdAt: new Date(),
    adult: false,
    aiLabel: null,
    sha256: "f".repeat(64),
    status: "READY",
    moderationState: "HELD",
    moderationReason: "classifier",
    hiddenReason: null,
    ...over,
  };
  db.s.items.push(item);
  db.s.assets.push(
    {
      contentItemId: ITEM_ID,
      role: "BLUR",
      variant: null,
      r2Key: "derived/abcdefghijklmnop/BLUR/b.webp",
      storage: "R2",
    },
    {
      contentItemId: ITEM_ID,
      role: "RENDITION",
      variant: "640",
      r2Key: "derived/abcdefghijklmnop/RENDITION/640.webp",
      storage: "R2",
    }
  );
  db.s.users.push({
    id: 7,
    handle: "maya",
    name: "Maya",
    email: "maya@amped.test",
    created_at: new Date(),
    block: "no",
  });
  return item;
}

async function open(type: any) {
  return (await openCase({ type, contentItemId: ITEM_ID, creatorUserId: 7, source: "test" })).case;
}

beforeEach(() => {
  for (const key of Object.keys(db.s)) (db.s as any)[key].length = 0;
  Object.values(edge).forEach(fn => fn.mockClear());
  Object.values(side).forEach(fn => fn.mockClear());
});

describe("queue (8.1)", () => {
  it("hides child safety from moderators and never shows its thumbnail", async () => {
    seedItem();
    await open("CLASSIFIER_HOLD");
    await open("CHILD_SAFETY");
    const mod = await listQueue({}, MOD);
    expect(mod.items.map(row => row.type)).toEqual(["CLASSIFIER_HOLD"]);
    expect(mod.items[0]!.thumb).toContain("tok:safety:BLUR");
    expect((await listQueue({ type: "CHILD_SAFETY" }, MOD)).items).toHaveLength(0);
    const lead = await listQueue({}, LEAD);
    const child = lead.items.find(row => row.type === "CHILD_SAFETY")!;
    expect(child.thumb).toBeNull();
  });
});

describe("case view (8.2)", () => {
  it("gives a moderator no child safety case, and the lead no media for it", async () => {
    seedItem();
    const child = await open("CHILD_SAFETY");
    await expect(getCase(hex(child.id), MOD)).rejects.toMatchObject({ code: "forbidden" });
    const view = await getCase(hex(child.id), LEAD);
    expect(view.noMedia).toBe(true);
    expect(view.item).toMatchObject({ title: null, assets: [] });
    await expect(
      revealAsset(hex(child.id), { role: "RENDITION", variant: "640" }, LEAD)
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("reveals one asset for 60 seconds with a Safety token, and logs it", async () => {
    seedItem();
    const hold = await open("CLASSIFIER_HOLD");
    const now = new Date("2026-11-05T10:00:00Z");
    const revealed = await revealAsset(
      hex(hold.id),
      { role: "RENDITION", variant: "640" },
      MOD,
      now
    );
    expect(revealed.url).toContain(`tok:safety:RENDITION:${Math.floor(now.getTime() / 1000) + 60}`);
    expect(db.s.events.at(-1)).toMatchObject({ action: "reveal", actorId: 50 });
  });

  it("lets one reviewer hold a claim until it lapses", async () => {
    seedItem();
    const hold = await open("CLASSIFIER_HOLD");
    const now = new Date();
    await claimCase(hex(hold.id), MOD, now);
    await expect(claimCase(hex(hold.id), LEAD, now)).rejects.toMatchObject({ code: "conflict" });
    await claimCase(hex(hold.id), LEAD, new Date(now.getTime() + 31 * 60_000));
    expect(db.s.cases[0]).toMatchObject({ assigneeId: 51, state: "CLAIMED" });
  });
});

describe("decisions (8.2)", () => {
  it("needs a note of 10 characters and a reason to remove", async () => {
    seedItem();
    const hold = await open("CLASSIFIER_HOLD");
    await expect(
      decideCase({ caseId: hex(hold.id), outcome: "clear", note: "short" }, MOD)
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(
      decideCase(
        { caseId: hex(hold.id), outcome: "removed", note: "Clearly not allowed here" },
        MOD
      )
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("clears a held item and refuses a second decision", async () => {
    const item = seedItem();
    const hold = await open("CLASSIFIER_HOLD");
    await decideCase({ caseId: hex(hold.id), outcome: "clear", note: "Not explicit, fine" }, MOD);
    expect(item).toMatchObject({ moderationState: "CLEAR", moderationReason: null });
    expect(db.s.cases[0]).toMatchObject({ state: "DECIDED", outcome: "clear", decidedById: 50 });
    await expect(
      decideCase({ caseId: hex(hold.id), outcome: "clear", note: "Not explicit, fine" }, MOD)
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("labels 18+ only for a creator with 18+ on", async () => {
    const item = seedItem();
    const hold = await open("CLASSIFIER_HOLD");
    await expect(
      decideCase(
        { caseId: hex(hold.id), outcome: "label_clear", note: "Explicit, consensual" },
        MOD
      )
    ).rejects.toMatchObject({ code: "bad_request" });
    db.s.profiles.push({ userId: 7, enabledAt: new Date(), disabledAt: null });
    await decideCase(
      { caseId: hex(hold.id), outcome: "label_clear", note: "Explicit, consensual" },
      MOD
    );
    expect(item).toMatchObject({ adult: true, moderationState: "CLEAR" });
  });

  it("removes: hides at the edge, blocks the file by the reason default, and only a lead strikes", async () => {
    const item = seedItem();
    const hold = await open("CLASSIFIER_HOLD");
    await expect(
      decideCase(
        {
          caseId: hex(hold.id),
          outcome: "removed",
          reasonCode: "copyright",
          note: "Uses a film clip",
          strike: true,
        },
        MOD
      )
    ).rejects.toMatchObject({ code: "forbidden" });
    await decideCase(
      {
        caseId: hex(hold.id),
        outcome: "removed",
        reasonCode: "copyright",
        note: "Uses a film clip",
        strike: true,
      },
      LEAD
    );
    expect(edge.hideItems).toHaveBeenCalledWith(["abcdefghijklmnop"], "safety");
    expect(item).toMatchObject({
      moderationState: "BLOCKED",
      moderationReason: "safety:copyright",
    });
    expect(db.s.hashes).toMatchObject([
      { sha256: "f".repeat(64), reason: "copyright", addedById: 51 },
    ]);
    expect(db.s.strikes).toMatchObject([{ userId: 7, reasonCode: "copyright" }]);
    expect(side.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["maya@amped.test"] })
    );
    expect(db.s.events.map(e => e.action)).toContain("strike");
  });

  it("asks for a change: the case waits for the creator and the item stays held", async () => {
    const item = seedItem();
    const hold = await open("CLASSIFIER_HOLD");
    await decideCase(
      {
        caseId: hex(hold.id),
        outcome: "needs_change",
        reasonCode: "explicit_unlabeled",
        note: "Needs the 18+ label",
      },
      MOD
    );
    expect(db.s.cases[0]!.state).toBe("WAITING_CREATOR");
    expect(item.moderationState).toBe("HELD");
  });
});

describe("escalate (8.5)", () => {
  it("hides the item for good, opens a Critical case, preserves evidence and alerts", async () => {
    seedItem();
    const hold = await open("CLASSIFIER_HOLD");
    const result = await escalateCase(
      { caseId: hex(hold.id), kind: "child_safety", note: "Looks like a minor" },
      MOD
    );
    expect(edge.hideItems).toHaveBeenCalledWith(["abcdefghijklmnop"], "child_safety");
    const child = db.s.cases.find(c => c.type === "CHILD_SAFETY")!;
    expect(child).toMatchObject({ severity: 0, number: result.number });
    expect(side.preserveEvidence).toHaveBeenCalled();
    expect(side.sendChildSafetyAlert).toHaveBeenCalled();
    expect(db.s.cases[0]).toMatchObject({ state: "DECIDED", outcome: "escalated" });
  });

  it("opens a Critical case without the media lock for trafficking", async () => {
    seedItem();
    const hold = await open("REPORT");
    await escalateCase(
      { caseId: hex(hold.id), kind: "trafficking", note: "Signs of coercion" },
      MOD
    );
    expect(edge.hideItems).not.toHaveBeenCalled();
    expect(db.s.cases.at(-1)).toMatchObject({
      type: "REPORT",
      severity: 0,
      reasonCode: "trafficking",
    });
  });
});
