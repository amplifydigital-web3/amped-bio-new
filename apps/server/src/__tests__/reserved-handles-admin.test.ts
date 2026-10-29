/**
 * Reserved handles RH2 (Build Board D2, docs/features/reserved-handles.md
 * sections 5 and 7): the admin tier in the database, the matcher cache, the
 * admin.handles flows, the notice sweeper and redirects. The database, Redis
 * and email are in memory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeHandlesDb, fakePrismaNamespace } from "./helpers/fakeHandlesDb";

const fake = vi.hoisted(() => ({
  db: null as any,
  redis: new Map<string, string>(),
  redisUp: true,
}));

vi.mock("@repo/database", async () => {
  const helper = await import("./helpers/fakeHandlesDb");
  const db = helper.createFakeHandlesDb();
  fake.db = db;
  return { prisma: db.client, Prisma: helper.fakePrismaNamespace };
});
vi.mock("../utils/cache", () => ({
  getRedisClient: () => ({
    get: async (key: string) => {
      if (!fake.redisUp) throw new Error("redis down");
      return fake.redis.get(key) ?? null;
    },
    incr: async (key: string) => {
      if (!fake.redisUp) throw new Error("redis down");
      const next = Number(fake.redis.get(key) ?? "0") + 1;
      fake.redis.set(key, String(next));
      return next;
    },
    expire: async () => 1,
  }),
}));
vi.mock("../utils/email/email", () => ({
  sendHandleNotice: vi.fn(async () => ({})),
  sendHandleAssigned: vi.fn(async () => ({})),
}));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));

import { seedAdminRows } from "@repo/constants";
import * as handles from "../services/handles/admin";
import { renameDueNotice, sweepReservedHandles } from "../services/handles/sweeper";
import { resolveHandleRedirect } from "../services/handles/redirects";
import {
  RESERVED_VERSION_KEY,
  matchReserved,
  resetReservedCache,
} from "../services/reservedHandles";
import { assertHandleAllowed, changeHandle } from "../services/pageHandle";
import { handlesAdminRouter } from "../trpc/admin/handles";
import { sendHandleAssigned, sendHandleNotice } from "../utils/email/email";
import { uuidv7 } from "../utils/uuid-v7";
import { prisma } from "@repo/database";

const ADMIN = 1;
const DAY = 24 * 60 * 60 * 1000;

function db() {
  return fake.db as ReturnType<typeof createFakeHandlesDb>;
}

function addUser(id: number, handle: string, extra: Record<string, unknown> = {}) {
  db()
    .table("user")
    .push({
      id,
      handle,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      page_status: "PUBLISHED",
      ...extra,
    });
}

function user(id: number) {
  return db()
    .table("user")
    .find(row => row.id === id)!;
}

function audits(action?: string) {
  return db()
    .table("adminAuditLog")
    .filter(row => !action || row.action === action);
}

function seedTable() {
  for (const row of seedAdminRows()) {
    db().table("reservedHandle").push({
      id: uuidv7(),
      word: row.word,
      kind: row.kind,
      category: row.category,
      reason: "seed",
      expiresAt: null,
      assignedUserId: null,
      createdById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

function rowFor(word: string) {
  return db()
    .table("reservedHandle")
    .find(row => row.word === word);
}

function hex(id: Uint8Array) {
  return Buffer.from(id).toString("hex");
}

beforeEach(() => {
  db().reset();
  fake.redis.clear();
  fake.redisUp = true;
  resetReservedCache();
  vi.clearAllMocks();
  addUser(ADMIN, "rob", { role: "admin" });
  seedTable();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("matcher cache (spec 4.1, acceptance 8)", () => {
  it("reads the admin tier from the table", async () => {
    expect((await matchReserved("support")).reserved).toBe(true);
    expect((await matchReserved("northlight")).reserved).toBe(false);
  });

  it("a write on this instance is seen at once", async () => {
    await matchReserved("northlight");
    await handles.reserve(ADMIN, {
      word: "northlight",
      kind: "EXACT",
      category: "BRAND",
      reason: "Brand talks",
      holders: [],
    });
    expect((await matchReserved("northlight")).reserved).toBe(true);
  });

  it("another instance sees the new version within 5 s", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    expect((await matchReserved("northlight")).reserved).toBe(false);

    // Another instance writes the row and bumps the version
    db().table("reservedHandle").push({
      id: uuidv7(),
      word: "northlight",
      kind: "EXACT",
      category: "BRAND",
      reason: "x",
      expiresAt: null,
      assignedUserId: null,
      createdById: ADMIN,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    fake.redis.set(RESERVED_VERSION_KEY, "7");

    clock.mockReturnValue(now + 1_000);
    expect((await matchReserved("northlight")).reserved).toBe(false);
    clock.mockReturnValue(now + 5_001);
    expect((await matchReserved("northlight")).reserved).toBe(true);
  });

  it("with Redis down, an instance reads the table again after 5 s", async () => {
    fake.redisUp = false;
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    expect((await matchReserved("northlight")).reserved).toBe(false);
    rowFor("support")!.word = "northlight";
    clock.mockReturnValue(now + 1_000);
    expect((await matchReserved("northlight")).reserved).toBe(false);
    clock.mockReturnValue(now + 5_001);
    expect((await matchReserved("northlight")).reserved).toBe(true);
  });

  it("with Redis up and no change, it still reloads after 60 s", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    expect((await matchReserved("northlight")).reserved).toBe(false);
    rowFor("support")!.word = "northlight";
    clock.mockReturnValue(now + 30_000);
    expect((await matchReserved("northlight")).reserved).toBe(false);
    clock.mockReturnValue(now + 60_001);
    expect((await matchReserved("northlight")).reserved).toBe(true);
  });

  it("a row past its end date stops matching at once (acceptance 12)", async () => {
    db()
      .table("reservedHandle")
      .push({
        id: uuidv7(),
        word: "dealhold",
        kind: "EXACT",
        category: "HOLD",
        reason: "x",
        expiresAt: new Date(Date.now() - 1000),
        assignedUserId: null,
        createdById: ADMIN,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    expect((await matchReserved("dealhold")).reserved).toBe(false);
  });
});

describe("reserve (spec 7.3)", () => {
  it("reserves a free word with one audit row", async () => {
    const result = await handles.reserve(ADMIN, {
      word: "Northlight",
      kind: "EXACT",
      category: "BRAND",
      reason: "Brand talks",
      holders: [],
    });
    expect(result).toMatchObject({ word: "northlight", holders: 0 });
    expect(rowFor("northlight")).toMatchObject({ category: "BRAND", createdById: ADMIN });
    expect(audits("handle.reserve")).toHaveLength(1);
    expect(audits("handle.reserve")[0]).toMatchObject({ actorId: ADMIN, subject: "northlight" });
  });

  it("refuses system words, bad prefixes, missing hold dates and words already covered", async () => {
    const base = { kind: "EXACT" as const, category: "BRAND" as const, reason: "x", holders: [] };
    await expect(handles.reserve(ADMIN, { ...base, word: "pools" })).rejects.toThrow(
      "pools is a system word, reserved in code."
    );
    await expect(handles.reserve(ADMIN, { ...base, word: "ad_min" })).rejects.toThrow(
      "system word"
    );
    await expect(handles.reserve(ADMIN, { ...base, word: "ab-", kind: "PREFIX" })).rejects.toThrow(
      "A prefix needs 3 or more letters or digits, then - or _."
    );
    await expect(handles.reserve(ADMIN, { ...base, word: "a b" })).rejects.toThrow(
      "Use only a to z, 0 to 9, - and _."
    );
    await expect(
      handles.reserve(ADMIN, { ...base, word: "dealhold", category: "HOLD" })
    ).rejects.toThrow("A hold needs an end date.");
    await expect(handles.reserve(ADMIN, { ...base, word: "sup_port" })).rejects.toThrow(
      "sup_port is already reserved. Open it from the Reserved tab to edit it."
    );
    expect(audits()).toHaveLength(0);
  });

  it("refuses with CONFLICT when the holders changed since Continue", async () => {
    addUser(10, "northlight");
    await expect(
      handles.reserve(ADMIN, {
        word: "northlight",
        kind: "EXACT",
        category: "BRAND",
        reason: "x",
        holders: [],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(rowFor("northlight")).toBeUndefined();
  });

  it("Start notice: a published page gets 14 days and an email (acceptance 11)", async () => {
    addUser(10, "team-hq");
    addUser(11, "team", { page_status: "PUBLISHED" });
    const collisions = await handles.checkCollisions({ word: "team-", kind: "PREFIX" });
    expect(collisions.accounts.map(account => account.id)).toEqual([10]);

    await handles.reserve(ADMIN, {
      word: "team-",
      kind: "PREFIX",
      category: "TRUST",
      reason: "Reads as staff",
      holders: [{ userId: 10, action: "notice" }],
    });
    const notice = db()
      .table("handleNotice")
      .find(row => row.userId === 10)!;
    expect(notice).toMatchObject({ state: "NOTICE_SENT", oldHandle: "team-hq", tier: "ADMIN" });
    expect(notice.deadline.getTime() - Date.now()).toBeGreaterThan(13.9 * DAY);
    expect(user(10).handle).toBe("team-hq");
    expect(sendHandleNotice).toHaveBeenCalledWith(
      "user10@example.com",
      expect.objectContaining({ handle: "team-hq" })
    );
    // reserve + notice start
    expect(
      audits()
        .map(row => row.action)
        .sort()
    ).toEqual(["handle.notice.start", "handle.reserve"]);
  });

  it("Start notice: an unpublished page is renamed at once with a redirect and no email", async () => {
    addUser(10, "acme-joe", { page_status: "UNPUBLISHED" });
    await handles.reserve(ADMIN, {
      word: "acme-",
      kind: "PREFIX",
      category: "BRAND",
      reason: "Acme deal",
      holders: [{ userId: 10, action: "notice" }],
    });
    expect(user(10).handle).toBe("joe");
    expect(db().table("handleNotice")[0]).toMatchObject({
      state: "RENAMED",
      oldHandle: "acme-joe",
    });
    expect(db().table("handleRedirect")[0]).toMatchObject({ oldHandle: "acme-joe", userId: 10 });
    expect(sendHandleNotice).not.toHaveBeenCalled();
    expect(audits("handle.rename")[0]).toMatchObject({ actorId: ADMIN, subject: "acme-" });
  });

  it("Keep and exempt: an exact word is assigned to its holder (acceptance 10)", async () => {
    addUser(10, "northlight");
    await handles.reserve(ADMIN, {
      word: "northlight",
      kind: "EXACT",
      category: "BRAND",
      reason: "Verified brand",
      holders: [{ userId: 10, action: "keep" }],
    });
    expect(rowFor("northlight")!.assignedUserId).toBe(10);
    await expect(assertHandleAllowed("northlight", 10)).resolves.toBeUndefined();
    await expect(assertHandleAllowed("northlight", 11)).rejects.toThrow("This handle is reserved");
  });

  it("Keep and exempt on a prefix records EXEMPT, and the account keeps passing", async () => {
    addUser(10, "acme_store");
    await handles.reserve(ADMIN, {
      word: "acme-",
      kind: "PREFIX",
      category: "PARTNER",
      reason: "Partner",
      holders: [{ userId: 10, action: "keep" }],
    });
    expect(db().table("handleNotice")[0]).toMatchObject({
      state: "EXEMPT",
      oldHandle: "acme_store",
    });
    await expect(assertHandleAllowed("acme_store", 10)).resolves.toBeUndefined();
    await expect(assertHandleAllowed("acme-other", 10)).rejects.toThrow("reserved");
  });

  it("above 20 matches, the Action for all covers the accounts not listed (acceptance 20)", async () => {
    for (let id = 100; id < 125; id++) addUser(id, `acme-${id}`, { page_status: "UNPUBLISHED" });
    const check = await handles.checkCollisions({ word: "acme-", kind: "PREFIX" });
    expect(check.total).toBe(25);
    expect(check.accounts).toHaveLength(20);
    await handles.reserve(ADMIN, {
      word: "acme-",
      kind: "PREFIX",
      category: "BRAND",
      reason: "x",
      defaultAction: "notice",
      holders: check.accounts.map(account => ({ userId: account.id, action: "keep" as const })),
    });
    const states = db()
      .table("handleNotice")
      .map(row => row.state);
    expect(states.filter(state => state === "EXEMPT")).toHaveLength(20);
    expect(states.filter(state => state === "RENAMED")).toHaveLength(5);
  });

  it("refuses a prefix that matches more than 200 accounts", async () => {
    for (let id = 100; id < 302; id++) addUser(id, `acme-${id}`);
    const check = await handles.checkCollisions({ word: "acme-", kind: "PREFIX" });
    expect(check.tooBroad).toBe(true);
    await expect(
      handles.reserve(ADMIN, {
        word: "acme-",
        kind: "PREFIX",
        category: "BRAND",
        reason: "x",
        holders: [],
      })
    ).rejects.toThrow("acme- matches more than 200 accounts. Reserve a narrower word.");
  });
});

describe("assign and unassign (spec 7.4, 7.5)", () => {
  it("assigns amped to the company account with a redirect and email", async () => {
    addUser(10, "amped-company");
    const amped = rowFor("amped")!;
    await handles.assign(ADMIN, {
      id: hex(amped.id),
      userId: 10,
      reason: "Company page",
      redirectOld: true,
      notify: true,
    });
    expect(user(10).handle).toBe("amped");
    expect(amped.assignedUserId).toBe(10);
    expect(db().table("handleRedirect")[0]).toMatchObject({
      oldHandle: "amped-company",
      userId: 10,
    });
    expect(sendHandleAssigned).toHaveBeenCalledWith(
      "user10@example.com",
      expect.objectContaining({ handle: "amped", oldHandle: "amped-company" })
    );
    await expect(assertHandleAllowed("amped", 11)).rejects.toThrow("reserved");
  });

  it("refuses while another account holds the word (acceptance 22)", async () => {
    addUser(10, "brandco");
    addUser(11, "help");
    await expect(
      handles.assign(ADMIN, {
        id: hex(rowFor("help")!.id),
        userId: 10,
        reason: "x",
        redirectOld: true,
        notify: false,
      })
    ).rejects.toThrow("@help holds amped.bio/help. Rename them or start a notice first.");
  });

  it("ends the assignment when the holder changes its handle itself", async () => {
    addUser(10, "amped-company");
    const amped = rowFor("amped")!;
    await handles.assign(ADMIN, {
      id: hex(amped.id),
      userId: 10,
      reason: "x",
      redirectOld: false,
      notify: false,
    });
    await prisma.$transaction(tx => changeHandle(tx, 10, "ampedhq"));
    expect(amped.assignedUserId).toBeNull();
    expect(audits("handle.unassign")[0]).toMatchObject({ actorId: null, subject: "amped" });
    expect((await matchReserved("amped")).reserved).toBe(true);
  });

  it("unassign keeps the handle as Exempt by default", async () => {
    addUser(10, "x-company");
    const amped = rowFor("amped")!;
    await handles.assign(ADMIN, {
      id: hex(amped.id),
      userId: 10,
      reason: "x",
      redirectOld: false,
      notify: false,
    });
    await handles.unassign(ADMIN, { id: hex(amped.id), reason: "Moved", startNotice: false });
    expect(amped.assignedUserId).toBeNull();
    expect(db().table("handleNotice")[0]).toMatchObject({ state: "EXEMPT", oldHandle: "amped" });
    await expect(assertHandleAllowed("amped", 10)).resolves.toBeUndefined();
  });
});

describe("release and restore (spec 7.4, acceptance 19)", () => {
  it("closes open notices as cancelled and Undo brings the row back", async () => {
    addUser(10, "help");
    const help = rowFor("help")!;
    await handles.reserve(ADMIN, {
      word: "help-",
      kind: "PREFIX",
      category: "TRUST",
      reason: "x",
      holders: [],
    });
    db()
      .table("handleNotice")
      .push({
        id: uuidv7(),
        userId: 10,
        reservedWord: "help",
        tier: "ADMIN",
        state: "NOTICE_SENT",
        oldHandle: "help",
        deadline: new Date(Date.now() - 1000),
        extensions: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const released = await handles.release(ADMIN, { id: hex(help.id), reason: "Not needed" });
    expect(rowFor("help")).toBeUndefined();
    expect(db().table("handleNotice")[0].state).toBe("CANCELLED");
    expect((await matchReserved("help")).reserved).toBe(false);

    // The sweeper never renames that account
    await sweepReservedHandles();
    expect(user(10).handle).toBe("help");

    await handles.restore(ADMIN, { auditId: released.auditId });
    expect(rowFor("help")).toBeDefined();
    expect((await matchReserved("help")).reserved).toBe(true);
  });

  it("Undo fails when someone claimed the word meanwhile", async () => {
    const help = rowFor("help")!;
    const released = await handles.release(ADMIN, { id: hex(help.id), reason: "x" });
    addUser(12, "help");
    await expect(handles.restore(ADMIN, { auditId: released.auditId })).rejects.toThrow(
      "Someone claimed amped.bio/help. Reserve it again to start a notice."
    );
  });
});

describe("sweeper (spec section 5)", () => {
  async function noticeFor(userId: number, word: string, deadline = new Date(Date.now() - 1000)) {
    db()
      .table("handleNotice")
      .push({
        id: uuidv7(),
        userId,
        reservedWord: word,
        tier: "ADMIN",
        state: "NOTICE_SENT",
        oldHandle: user(userId).handle,
        deadline,
        extensions: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    return db().table("handleNotice").at(-1)!;
  }

  it("renames on the deadline with a 90 day redirect and a system audit row", async () => {
    addUser(10, "support");
    await noticeFor(10, "support");
    const result = await sweepReservedHandles();
    expect(result.renamed).toBe(1);
    expect(user(10).handle).toMatch(/^support\d{4}$/);
    const redirect = db().table("handleRedirect")[0];
    expect(redirect).toMatchObject({ oldHandle: "support", userId: 10 });
    expect(redirect.endsAt.getTime() - Date.now()).toBeGreaterThan(89 * DAY);
    expect(audits("handle.rename")[0]).toMatchObject({ actorId: null, subject: "support" });
    expect(db().table("handleNotice")[0].state).toBe("RENAMED");
  });

  it("closes as chose_new when the account moved first", async () => {
    addUser(10, "support");
    const notice = await noticeFor(10, "support");
    user(10).handle = "maya";
    await sweepReservedHandles();
    expect(notice.state).toBe("CHOSE_NEW");
    expect(user(10).handle).toBe("maya");
  });

  it("two sweepers never act on one notice twice (acceptance 21)", async () => {
    addUser(10, "support");
    const notice = await noticeFor(10, "support");
    const outcomes = await Promise.all([renameDueNotice(notice), renameDueNotice(notice)]);
    expect(outcomes.sort()).toEqual(["renamed", "skipped"]);
    expect(audits("handle.rename")).toHaveLength(1);
  });

  it("does nothing before the deadline", async () => {
    addUser(10, "support");
    await noticeFor(10, "support", new Date(Date.now() + DAY));
    await sweepReservedHandles();
    expect(user(10).handle).toBe("support");
  });

  it("deletes a row past its end date with one handle.expired row (acceptance 12)", async () => {
    await handles.reserve(ADMIN, {
      word: "dealhold",
      kind: "EXACT",
      category: "HOLD",
      reason: "x",
      expiresAt: new Date(Date.now() + 60_000),
      holders: [],
    });
    rowFor("dealhold")!.expiresAt = new Date(Date.now() - 1000);
    const result = await sweepReservedHandles();
    expect(result.rowsExpired).toBe(1);
    expect(rowFor("dealhold")).toBeUndefined();
    expect(audits("handle.expired")).toEqual([
      expect.objectContaining({ actorId: null, subject: "dealhold" }),
    ]);
  });
});

describe("redirects (spec 7.7, acceptance 17 and 18)", () => {
  beforeEach(() => {
    addUser(10, "maya-new");
    db()
      .table("handleRedirect")
      .push({
        id: uuidv7(),
        oldHandle: "maya",
        userId: 10,
        endsAt: new Date(Date.now() + 10 * DAY),
        hits: 0,
        createdAt: new Date(),
      });
  });

  it("answers the account's current handle and counts the hit", async () => {
    expect(await resolveHandleRedirect("maya")).toEqual({ to: "maya-new" });
    expect(db().table("handleRedirect")[0].hits).toBe(1);
  });

  it("follows a later rename: the row stores the account", async () => {
    user(10).handle = "maya-third";
    expect(await resolveHandleRedirect("maya")).toEqual({ to: "maya-third" });
  });

  it("answers null once ended or when the page is not published", async () => {
    db().table("handleRedirect")[0].endsAt = new Date(Date.now() - 1);
    expect(await resolveHandleRedirect("maya")).toBeNull();
    db().table("handleRedirect")[0].endsAt = new Date(Date.now() + DAY);
    user(10).page_status = "UNPUBLISHED";
    expect(await resolveHandleRedirect("maya")).toBeNull();
  });

  it("claiming the old handle deletes the redirect in the same write", async () => {
    addUser(11, "someone");
    await prisma.$transaction(tx => changeHandle(tx, 11, "maya"));
    expect(db().table("handleRedirect")).toHaveLength(0);
  });

  it("End now and Undo", async () => {
    const ended = await handles.endRedirect(ADMIN, { oldHandle: "maya", reason: "Asked" });
    expect(db().table("handleRedirect")).toHaveLength(0);
    await handles.restoreRedirect(ADMIN, { auditId: ended.auditId });
    expect(db().table("handleRedirect")[0]).toMatchObject({ oldHandle: "maya", userId: 10 });
  });
});

describe("holders (spec 7.6)", () => {
  it("Extend adds 7 days, twice at most", async () => {
    addUser(10, "support");
    const deadline = new Date(Date.now() + DAY);
    db().table("handleNotice").push({
      id: uuidv7(),
      userId: 10,
      reservedWord: "support",
      tier: "ADMIN",
      state: "NOTICE_SENT",
      oldHandle: "support",
      deadline,
      extensions: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const noticeId = hex(db().table("handleNotice")[0].id);
    await handles.extendNotice(ADMIN, { noticeId, reason: "Asked for time" });
    await handles.extendNotice(ADMIN, { noticeId, reason: "Asked again" });
    await expect(handles.extendNotice(ADMIN, { noticeId, reason: "x" })).rejects.toThrow(
      "already extended twice"
    );
    expect(db().table("handleNotice")[0].deadline.getTime()).toBe(deadline.getTime() + 14 * DAY);
  });

  it("a failed email marks the notice Failed, and Retry sends again", async () => {
    vi.mocked(sendHandleNotice).mockRejectedValueOnce(new Error("smtp down"));
    addUser(10, "team-hq");
    await handles.reserve(ADMIN, {
      word: "team-",
      kind: "PREFIX",
      category: "TRUST",
      reason: "x",
      holders: [{ userId: 10, action: "notice" }],
    });
    const notice = db().table("handleNotice")[0];
    expect(notice.state).toBe("FAILED");
    await handles.retryNotice(ADMIN, { noticeId: hex(notice.id), reason: "Retry" });
    expect(notice.state).toBe("NOTICE_SENT");
    expect(sendHandleNotice).toHaveBeenCalledTimes(2);
  });

  it("system words cannot be exempted", async () => {
    addUser(10, "pools");
    db()
      .table("handleNotice")
      .push({
        id: uuidv7(),
        userId: 10,
        reservedWord: "pools",
        tier: "SYSTEM",
        state: "NOTICE_SENT",
        oldHandle: "pools",
        deadline: new Date(Date.now() + DAY),
        extensions: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    await expect(
      handles.exemptNotice(ADMIN, { noticeId: hex(db().table("handleNotice")[0].id), reason: "x" })
    ).rejects.toThrow("A system word cannot be exempted.");
  });
});

describe("reads", () => {
  it("lists both tiers; system rows come from code with no id", async () => {
    const system = await handles.listWords({ filter: "system", limit: 500 });
    expect(system.items.every(row => row.tier === "system" && row.id === null)).toBe(true);
    expect(system.items.map(row => row.word)).toContain("pools");
    expect(system.items.map(row => row.word)).toContain("_");
    const trust = await handles.listWords({ filter: "trust", limit: 500 });
    expect(trust.items.map(row => row.word)).toContain("support");
    const search = await handles.listWords({ filter: "all", search: "suppo", limit: 500 });
    expect(search.items.map(row => row.word)).toEqual(["support", "support-"]);
  });

  it("reads a system word by word", async () => {
    await expect(handles.getWord({ word: "pools" })).resolves.toMatchObject({
      tier: "system",
      id: null,
    });
  });

  it("exports the log as CSV with no email and no JSON", async () => {
    await handles.reserve(ADMIN, {
      word: "northlight",
      kind: "EXACT",
      category: "BRAND",
      reason: 'Brand, "talks"',
      holders: [],
    });
    const { csv } = await handles.exportLog({
      from: new Date(Date.now() - DAY),
      to: new Date(Date.now() + DAY),
    });
    const lines = csv.split("\n");
    expect(lines[0]).toBe("time,admin,action,word,target,reason");
    expect(lines[1]).toContain(',@rob,handle.reserve,northlight,,"Brand, ""talks"""');
    expect(csv).not.toContain("@example.com");
  });
});

describe("admin.handles access (decision A3, acceptance 15)", () => {
  const caller = (user?: { sub: number; role: string }) =>
    handlesAdminRouter.createCaller({ user, req: { headers: {} } } as never);

  it("signed out callers get UNAUTHORIZED", async () => {
    await expect(caller().list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("signed in non admins get FORBIDDEN on reads and writes", async () => {
    const member = caller({ sub: 5, role: "user" });
    await expect(member.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      member.reserve({ word: "x-y-z", kind: "EXACT", category: "BRAND", reason: "x" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.holders.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admins can list", async () => {
    const result = await caller({ sub: ADMIN, role: "admin" }).list();
    expect(result.total).toBeGreaterThan(40);
  });
});

void fakePrismaNamespace;
