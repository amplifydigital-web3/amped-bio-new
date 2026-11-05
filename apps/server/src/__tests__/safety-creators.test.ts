/** Creators, suspend, appeals and the log (adult content review 5.4, 8.4, 8.6, PR R5). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const s: Record<string, Row[]> = {
    cases: [],
    events: [],
    items: [],
    users: [],
    strikes: [],
    requests: [],
    profiles: [],
  };
  const hex = (v: any) => (v ? Buffer.from(v).toString("hex") : null);
  const eq = (a: any, b: any) =>
    a instanceof Uint8Array || b instanceof Uint8Array ? hex(a) === hex(b) : a === b;
  const match = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === "OR") return (value as Row[]).some(w => match(row, w));
      if (
        value &&
        typeof value === "object" &&
        !(value instanceof Uint8Array) &&
        !(value instanceof Date)
      ) {
        if ("in" in value) return value.in.some((v: any) => eq(row[key], v));
        if ("not" in value) return !eq(row[key], value.not);
        if ("path" in value) return row[key]?.[value.path.slice(2)] === value.equals;
        if ("gte" in value) return row[key] >= value.gte;
        if ("startsWith" in value) return String(row[key]).startsWith(value.startsWith);
      }
      return eq(row[key] ?? null, value);
    });
  const table = (name: string, defaults: Row = {}) => ({
    findUnique: vi.fn(async ({ where }: any) => s[name]!.find(r => match(r, where)) ?? null),
    findFirst: vi.fn(async ({ where, orderBy }: any) => {
      const rows = s[name]!.filter(r => match(r, where));
      return (
        (orderBy?.createdAt === "desc" || orderBy?.decidedAt === "desc"
          ? rows.reverse()
          : rows)[0] ?? null
      );
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
    safetyCase: table("cases", { state: "OPEN" }),
    safetyEvent: table("events"),
    contentItem: table("items"),
    user: table("users"),
    strike: table("strikes"),
    takedownRequest: table("requests"),
    creatorAdultProfile: table("profiles"),
    appearingPerson: table("profiles"),
  };
  return { prisma, s };
});
const edge = vi.hoisted(() => ({
  hideCreator: vi.fn(async () => {}),
  restoreItems: vi.fn(async () => ({})),
}));
const mail = vi.hoisted(() => ({ deliverEmail: vi.fn(async () => ({})) }));

vi.mock("@repo/database", () => ({
  prisma: db.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("../services/content/edge", () => edge);
vi.mock("../utils/email/transport", () => mail);
vi.mock("../services/identity/checks", () => ({
  checkIdentity: vi.fn(async () => ({ pass: true })),
}));

import { safetyBox } from "../services/safety/crypto";
import {
  approveSuspend,
  decideAppeal,
  exportLog,
  fileAppeal,
  listLog,
  requestSuspend,
  restoreAfterNotice,
} from "../services/safety/creators";

const MOD = { id: 50, lead: false };
const LEAD = { id: 51, lead: true };
const LEAD2 = { id: 52, lead: true };
const ITEM = Buffer.alloc(16, 1);
const hex = (v: Uint8Array) => Buffer.from(v).toString("hex");

function decided(over: Record<string, unknown> = {}) {
  const row = {
    id: Buffer.alloc(16, 9),
    number: "SC-2026-000009",
    type: "REPORT",
    state: "DECIDED",
    outcome: "removed",
    contentItemId: ITEM,
    creatorUserId: 7,
    decidedById: 51,
    decidedAt: new Date(),
    dueAt: new Date(),
    ...over,
  };
  db.s.cases!.push(row);
  return row;
}

beforeEach(() => {
  for (const key of Object.keys(db.s)) db.s[key] = [];
  edge.hideCreator.mockClear();
  edge.restoreItems.mockClear();
  mail.deliverEmail.mockClear();
  db.s.users!.push({
    id: 7,
    handle: "maya",
    name: "Maya",
    email: "maya@amped.test",
    block: "no",
    created_at: new Date(),
  });
  db.s.items!.push({ id: ITEM, publicId: "item000000000001", userId: 7 });
});

describe("suspend (8.4)", () => {
  it("needs a second safety lead, and suspends at once only for D6 cases", async () => {
    await expect(
      requestSuspend({ handle: "maya", reason: "Repeat removals", immediate: true }, LEAD)
    ).rejects.toMatchObject({ code: "bad_request" });
    await requestSuspend({ handle: "maya", reason: "Repeat removals" }, LEAD);
    expect(db.s.users![0]!.block).toBe("no");
    await expect(approveSuspend("maya", LEAD)).rejects.toMatchObject({ code: "forbidden" });
    await approveSuspend("maya", LEAD2);
    expect(db.s.users![0]!.block).toBe("yes");
    expect(edge.hideCreator).toHaveBeenCalledWith(7);
  });

  it("suspends at once with an open child safety case and still asks for approval", async () => {
    db.s.cases!.push({
      id: Buffer.alloc(16, 3),
      type: "CHILD_SAFETY",
      state: "OPEN",
      creatorUserId: 7,
    });
    const result = await requestSuspend(
      { handle: "maya", reason: "Child safety escalation", immediate: true },
      LEAD
    );
    expect(result).toEqual({ suspended: true, waitingForApproval: true });
    expect(db.s.users![0]!.block).toBe("yes");
  });
});

describe("appeals (5.4, 8.6)", () => {
  it("allows one appeal within 30 days and never on child safety", async () => {
    decided({ type: "CHILD_SAFETY", outcome: "removed" });
    await expect(
      fileAppeal(7, { publicId: "item000000000001", text: "This is wrong, please check" })
    ).rejects.toMatchObject({ code: "forbidden" });
    db.s.cases = [];
    decided({ decidedAt: new Date(Date.now() - 31 * 86_400_000) });
    await expect(
      fileAppeal(7, { publicId: "item000000000001", text: "This is wrong, please check" })
    ).rejects.toMatchObject({ code: "bad_request" });
    db.s.cases = [];
    decided();
    const appeal = await fileAppeal(7, {
      publicId: "item000000000001",
      text: "This is wrong, please check",
    });
    expect(appeal.number).toMatch(/^SC-/);
    await expect(
      fileAppeal(7, { publicId: "item000000000001", text: "Second try, please check" })
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("needs a different reviewer, and Reverse restores the item and the strike", async () => {
    const parent = decided();
    db.s.strikes!.push({ caseId: parent.id, userId: 7, reversedAt: null });
    await fileAppeal(7, { publicId: "item000000000001", text: "This is wrong, please check" });
    const appeal = db.s.cases!.find(c => c.type === "APPEAL")!;
    await expect(
      decideAppeal(
        { caseId: hex(appeal.id), outcome: "reversed", note: "Original call was wrong" },
        LEAD
      )
    ).rejects.toMatchObject({ code: "forbidden" });
    await decideAppeal(
      { caseId: hex(appeal.id), outcome: "reversed", note: "Original call was wrong" },
      LEAD2
    );
    expect(edge.restoreItems).toHaveBeenCalledWith(["item000000000001"]);
    expect(db.s.strikes![0]!.reversedAt).toBeInstanceOf(Date);
  });

  it("tells the Take It Down requester first and restores only after 2 business days", async () => {
    db.s.requests!.push({
      id: Buffer.alloc(16, 4),
      number: "TD-2026-000001",
      contactEmail: safetyBox.encrypt("me@example.test"),
    });
    decided({ type: "TAKE_IT_DOWN", requestId: Buffer.alloc(16, 4) });
    await fileAppeal(7, { publicId: "item000000000001", text: "I am the person shown, it was me" });
    const appeal = db.s.cases!.find(c => c.type === "APPEAL")!;
    const now = new Date("2026-11-05T12:00:00Z");
    const result = await decideAppeal(
      { caseId: hex(appeal.id), outcome: "reversed", note: "Requester is not shown" },
      LEAD2,
      now
    );
    expect(result.restoreAfter!.toISOString()).toBe("2026-11-09T12:00:00.000Z");
    expect(mail.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["me@example.test"] })
    );
    expect(edge.restoreItems).not.toHaveBeenCalled();
    await expect(restoreAfterNotice(hex(appeal.id), LEAD2, now)).rejects.toMatchObject({
      code: "bad_request",
    });
    await restoreAfterNotice(hex(appeal.id), LEAD2, new Date("2026-11-10T00:00:00Z"));
    expect(edge.restoreItems).toHaveBeenCalledWith(["item000000000001"]);
  });
});

describe("log (8.6)", () => {
  it("shows moderators their own actions and lets only a safety lead export", async () => {
    db.s.events!.push(
      {
        actorId: 50,
        action: "reveal",
        createdAt: new Date(),
        detail: null,
        note: null,
        caseId: null,
      },
      {
        actorId: 51,
        action: "decide",
        createdAt: new Date(),
        detail: null,
        note: "x",
        caseId: null,
      }
    );
    expect((await listLog({}, MOD)).map(r => r.actorId)).toEqual([50]);
    expect(await listLog({}, LEAD)).toHaveLength(2);
    await expect(exportLog({}, MOD)).rejects.toMatchObject({ code: "forbidden" });
    const csv = await exportLog({}, LEAD);
    expect(csv.split("\n")[0]).toBe("at,actor,case,action,detail,note");
    expect(db.s.events!.at(-1)).toMatchObject({ action: "export", actorId: 51 });
  });
});
