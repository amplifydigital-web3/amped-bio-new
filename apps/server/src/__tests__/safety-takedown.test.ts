/**
 * Take It Down, copyright notices and reports (adult content review 7.1 to 7.5, 8.3,
 * PR R3). The database, the edge and email are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const s: Record<string, Row[]> = {
    cases: [],
    events: [],
    items: [],
    requests: [],
    hashes: [],
    reports: [],
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
        if ("notIn" in value) return !value.notIn.some((v: any) => eq(row[key], v));
        if ("not" in value) return value.not === null ? row[key] != null : !eq(row[key], value.not);
        if ("lt" in value) return row[key] < value.lt;
        if ("gte" in value) return row[key] >= value.gte;
        if ("startsWith" in value) return String(row[key]).startsWith(value.startsWith);
      }
      return eq(row[key] ?? null, value);
    });
  const table = (name: string, defaults: Row = {}) => ({
    findUnique: vi.fn(async ({ where }: any) => s[name]!.find(r => match(r, where)) ?? null),
    findFirst: vi.fn(async ({ where, orderBy }: any) => {
      let rows = s[name]!.filter(r => match(r, where));
      if (orderBy?.number === "desc")
        rows = [...rows].sort((a, b) => b.number.localeCompare(a.number));
      return rows[0] ?? null;
    }),
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
  });
  const prisma: any = {
    safetyCase: table("cases", { state: "OPEN", assigneeId: null }),
    safetyEvent: table("events"),
    contentItem: table("items"),
    takedownRequest: table("requests", { closedAt: null, outcome: null }),
    blockedContentHash: table("hashes", { removedAt: null }),
    contentReport: table("reports"),
    user: table("users"),
    siteSettings: { findUnique: vi.fn(async () => null) },
  };
  return { prisma, s };
});
const edge = vi.hoisted(() => ({
  hideItems: vi.fn(async (ids: string[]) => {
    db.s.items!.filter(i => ids.includes(i.publicId)).forEach(i => (i.hiddenAt = new Date()));
    return { synced: ids, pending: [] };
  }),
  restoreItems: vi.fn(async (ids: string[]) => {
    db.s.items!.filter(i => ids.includes(i.publicId)).forEach(i => (i.hiddenAt = null));
    return { synced: ids, pending: [] };
  }),
}));
const mail = vi.hoisted(() => ({ deliverEmail: vi.fn(async () => ({})) }));
const alert = vi.hoisted(() => ({ sendChildSafetyAlert: vi.fn(async () => ({})) }));

vi.mock("@repo/database", () => ({
  prisma: db.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("../services/content/edge", () => edge);
vi.mock("../utils/email/transport", () => mail);
vi.mock("../services/safety/alert", () => alert);

import { env } from "../env";
import {
  publicIdFromLink,
  requestStatus,
  submitCopyright,
  submitCounterNotice,
  submitTakedown,
} from "../services/safety/takedown";
import { decideCopyright, decideTakedown, restoreAfterCounter } from "../services/safety/requests";
import { intakeReport } from "../services/safety/reports";

const LEAD = { id: 51, lead: true };
const item = (n: number, over: Record<string, unknown> = {}) => ({
  id: Buffer.alloc(16, n),
  publicId: `item${String(n).padStart(12, "0")}`,
  userId: 7,
  sha256: "a".repeat(64),
  hiddenAt: null,
  title: "Set",
  ...over,
});
const link = (publicId: string) => `https://amped.bio/maya/c/${publicId}`;
const takedown = (over: Record<string, unknown> = {}) => ({
  links: [link("item000000000001")],
  goodFaith: true,
  relationship: "self" as const,
  email: "me@example.test",
  signature: "Jane Doe",
  ...over,
});

beforeEach(() => {
  for (const key of Object.keys(db.s)) db.s[key]!.length = 0;
  Object.values(edge).forEach(fn => fn.mockClear());
  mail.deliverEmail.mockClear();
  alert.sendChildSafetyAlert.mockClear();
  Object.assign(env, { LANDINGPAGE_URL: "https://amped.bio" });
  db.s.items!.push(item(1), item(2, { userId: 9 }), item(3, { sha256: "b".repeat(64) }));
  db.s.users!.push({ id: 7, email: "maya@amped.test" }, { id: 9, email: "copy@amped.test" });
});

describe("links", () => {
  it("reads Amped item links and nothing else", () => {
    expect(publicIdFromLink("https://amped.bio/maya/c/item000000000001")).toBe("item000000000001");
    expect(publicIdFromLink("https://amped.bio/@maya/adult/item000000000001")).toBe(
      "item000000000001"
    );
    expect(publicIdFromLink("https://evil.test/maya/c/item000000000001")).toBeNull();
    expect(publicIdFromLink("https://amped.bio/maya")).toBeNull();
  });
});

describe("Take It Down (7.2, 7.3)", () => {
  it("hides a valid request's items and exact copies at once, opens a case and emails a status link", async () => {
    const result = await submitTakedown(takedown());
    expect(result).toMatchObject({ valid: true, missing: [], hidden: 2 });
    expect(edge.hideItems).toHaveBeenCalledWith(
      expect.arrayContaining(["item000000000001", "item000000000002"]),
      "take_it_down"
    );
    expect(db.s.cases).toMatchObject([{ type: "TAKE_IT_DOWN", severity: 1 }]);
    const stored = db.s.requests![0]!;
    expect(stored.contactEmail).not.toContain("me@example.test");
    expect(stored.dueAt.getTime() - stored.receivedAt.getTime()).toBe(48 * 3_600_000);
    const status = await requestStatus(result.number, result.key);
    expect(status).toMatchObject({ state: "hidden", outcome: null });
    expect(await requestStatus(result.number, "x".repeat(32))).toBeNull();
  });

  it("issues a number but hides nothing when a part is missing", async () => {
    const result = await submitTakedown(
      takedown({ goodFaith: false, links: ["https://evil.test/x"] })
    );
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(["link", "statement"]));
    expect(edge.hideItems).not.toHaveBeenCalled();
    const status = await requestStatus(result.number, result.key);
    expect(status).toMatchObject({
      state: "needs_more",
      missing: expect.arrayContaining(["statement"]),
    });
  });

  it("Remove blocks the hash and tells the creator without the requester; Not valid restores", async () => {
    const removed = await submitTakedown(takedown());
    await decideTakedown(
      { number: removed.number, outcome: "removed", note: "The person shown asked" },
      LEAD
    );
    expect(db.s.hashes).toMatchObject([{ sha256: "a".repeat(64), reason: "ncii" }]);
    const toCreator = mail.deliverEmail.mock.calls.find(
      (call: any) => call[0].to[0] === "maya@amped.test"
    )!;
    expect(JSON.stringify(toCreator)).not.toContain("me@example.test");
    expect(db.s.requests![0]).toMatchObject({ outcome: "removed" });

    const other = await submitTakedown(takedown({ links: [link("item000000000003")] }));
    await decideTakedown(
      { number: other.number, outcome: "not_valid", note: "Not the person shown" },
      LEAD
    );
    expect(edge.restoreItems).toHaveBeenCalledWith(["item000000000003"]);
  });
});

describe("copyright (7.5)", () => {
  const notice = {
    work: "My photo series",
    links: [link("item000000000003")],
    name: "Ana Owner",
    postalAddress: "1 Main St, Boston MA",
    email: "ana@example.test",
    goodFaith: true,
    accurate: true,
    signature: "Ana Owner",
  };

  it("opens a Copyright case without hiding; Disable tells the creator the sender's name and email", async () => {
    const result = await submitCopyright(notice);
    expect(result.valid).toBe(true);
    expect(edge.hideItems).not.toHaveBeenCalled();
    expect(db.s.cases).toMatchObject([
      { type: "COPYRIGHT", number: expect.stringMatching(/^CN-/) },
    ]);
    await decideCopyright(
      { number: result.number, outcome: "removed", note: "Same photo, cropped" },
      LEAD
    );
    expect(edge.hideItems).toHaveBeenCalledWith(["item000000000003"], "safety");
    const toCreator = JSON.stringify(
      mail.deliverEmail.mock.calls.find((call: any) => call[0].to[0] === "maya@amped.test")
    );
    expect(toCreator).toContain("Ana Owner");
    expect(toCreator).toContain("ana@example.test");
    expect(toCreator).not.toContain("Main St");
  });

  it("takes a counter notice from the owner and restores only inside the window", async () => {
    const result = await submitCopyright(notice);
    await decideCopyright(
      { number: result.number, outcome: "removed", note: "Same photo, cropped" },
      LEAD
    );
    expect(await submitCounterNotice(9, { number: result.number } as never)).toBeNull();
    const now = new Date("2026-11-05T12:00:00Z");
    const counter = await submitCounterNotice(
      7,
      {
        number: result.number,
        mistake: true,
        name: "Maya Lin",
        postalAddress: "2 Side St",
        phone: "+15550001111",
        jurisdiction: true,
        acceptService: true,
        signature: "Maya Lin",
      },
      now
    );
    expect(counter!.restoreFrom.toISOString()).toBe("2026-11-19T12:00:00.000Z");
    await expect(restoreAfterCounter(counter!.number, LEAD, now)).rejects.toMatchObject({
      code: "bad_request",
    });
    await restoreAfterCounter(counter!.number, LEAD, new Date("2026-11-20T00:00:00Z"));
    expect(edge.restoreItems).toHaveBeenCalledWith(["item000000000003"]);
  });
});

describe("reports (7.1)", () => {
  it("hides on a child report and opens a Critical case; other reasons hide nothing", async () => {
    const result = await intakeReport(db.s.items![0] as never, {
      reason: "csam",
      details: null,
      reporterUserId: 20,
    });
    expect(result.hidden).toBe(true);
    expect(db.s.cases).toMatchObject([{ type: "CHILD_SAFETY", severity: 0 }]);
    expect(alert.sendChildSafetyAlert).toHaveBeenCalled();
    await intakeReport(db.s.items![2] as never, {
      reason: "scam",
      details: "x",
      reporterUserId: 20,
    });
    expect(edge.hideItems).toHaveBeenCalledTimes(1);
    expect(db.s.cases.at(-1)).toMatchObject({ type: "REPORT" });
    expect(db.s.reports!.every(r => r.caseId)).toBe(true);
  });

  it("drops the automatic hide for a reporter with 3 unfounded child reports in 30 days", async () => {
    for (let i = 0; i < 3; i += 1) {
      const id = Buffer.alloc(16, 100 + i);
      db.s.cases!.push({ id, outcome: "clear", number: `SC-2026-00010${i}` });
      db.s.reports!.push({ reporterUserId: 20, reason: "csam", createdAt: new Date(), caseId: id });
    }
    const result = await intakeReport(db.s.items![0] as never, {
      reason: "csam",
      details: null,
      reporterUserId: 20,
    });
    expect(result.hidden).toBe(false);
    expect(db.s.cases.find(c => c.type === "CHILD_SAFETY")).toBeTruthy();
  });
});
