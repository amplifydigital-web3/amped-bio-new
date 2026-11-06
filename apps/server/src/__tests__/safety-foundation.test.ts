/**
 * Safety foundation (Build Board #28, adult content review 8 and 10, PR R1): due times,
 * case numbers and joins, the append only log, settings, the hash blocklist, the
 * evidence copy and the child safety alert. The database, R2 and Twilio are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  type Row = Record<string, any>;
  const state = {
    cases: [] as Row[],
    events: [] as Row[],
    hashes: [] as Row[],
    settings: null as string | null,
    users: [] as Row[],
    items: [] as Row[],
  };
  const hex = (v: any) => (v ? Buffer.from(v).toString("hex") : null);
  const prisma: any = {
    safetyCase: {
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        let rows = state.cases;
        if (where.number?.startsWith) {
          rows = rows.filter(r => r.number.startsWith(where.number.startsWith));
        }
        if (where.type) rows = rows.filter(r => r.type === where.type);
        if (where.contentItemId) {
          rows = rows.filter(r => hex(r.contentItemId) === hex(where.contentItemId));
        }
        if (where.state?.in) rows = rows.filter(r => where.state.in.includes(r.state));
        if (orderBy?.number === "desc") {
          rows = [...rows].sort((a, b) => b.number.localeCompare(a.number));
        }
        return rows[0] ?? null;
      }),
      findUnique: vi.fn(
        async ({ where }: any) => state.cases.find(r => hex(r.id) === hex(where.id)) ?? null
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = { state: "OPEN", ...data };
        state.cases.push(row);
        return row;
      }),
    },
    safetyEvent: {
      create: vi.fn(async ({ data }: any) => {
        state.events.push(data);
        return data;
      }),
    },
    blockedContentHash: {
      findUnique: vi.fn(
        async ({ where }: any) =>
          state.hashes.find(r =>
            where.sha256 ? r.sha256 === where.sha256 : hex(r.id) === hex(where.id)
          ) ?? null
      ),
      create: vi.fn(async ({ data }: any) => {
        state.hashes.push({ removedAt: null, ...data });
        return data;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.hashes.find(r =>
          where.sha256 ? r.sha256 === where.sha256 : hex(r.id) === hex(where.id)
        )!;
        return Object.assign(row, data);
      }),
      findMany: vi.fn(async () => state.hashes.filter(r => r.phash && !r.removedAt)),
    },
    siteSettings: {
      findUnique: vi.fn(async () =>
        state.settings === null ? null : { setting_value: state.settings }
      ),
      upsert: vi.fn(async ({ create, update }: any) => {
        state.settings = state.settings === null ? create.setting_value : update.setting_value;
      }),
    },
    user: { findMany: vi.fn(async () => state.users) },
    contentItem: {
      findUnique: vi.fn(
        async ({ where }: any) => state.items.find(r => r.publicId === where.publicId) ?? null
      ),
    },
    contentAsset: { findFirst: vi.fn(async () => null) },
    session: { findMany: vi.fn(async () => [{ ipAddress: "203.0.113.9" }, { ipAddress: null }]) },
  };
  return { prisma, state };
});

const mail = vi.hoisted(() => ({ deliverEmail: vi.fn(async () => ({})) }));
const r2 = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@repo/database", async () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return { prisma: db.prisma, Prisma: { PrismaClientKnownRequestError } };
});
vi.mock("../utils/email/transport", () => mail);
vi.mock("../services/cloudflare/r2", () => ({
  getR2Client: () => r2,
  r2Endpoint: (id: string) => `https://${id}.r2.cloudflarestorage.com`,
}));

import { env } from "../env";
import { addBusinessDays, caseDueAt } from "../services/safety/time";
import { openCase, nextNumber } from "../services/safety/cases";
import { getSafetySettings, updateSafetySettings } from "../services/safety/settings";
import {
  BlocklistError,
  blockHash,
  findBlockedHash,
  findByPhash,
  phashDistance,
  unblockHash,
} from "../services/safety/blocklist";
import { childSafetyAlertText, sendChildSafetyAlert, SMS_ATTEMPTS } from "../services/safety/alert";
import {
  evidencePrefixes,
  preserveEvidence,
  setEvidenceClientForTests,
} from "../services/safety/evidence";

const ITEM = Uint8Array.from({ length: 16 }, (_, i) => i + 1);
const fetchMock = vi.fn();

beforeEach(() => {
  Object.assign(db.state, {
    cases: [],
    events: [],
    hashes: [],
    settings: null,
    users: [],
    items: [],
  });
  mail.deliverEmail.mockClear();
  r2.send.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(env, {
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_MESSAGING_SERVICE_SID: "",
    ADMIN_URL: "https://admin.amped.test",
    SAFETY_ALERT_EMAIL: "",
    CF_ACCOUNT_ID: "",
    R2_BUCKET: "",
    EVIDENCE_R2_ACCESS_KEY_ID: "",
    EVIDENCE_R2_SECRET_ACCESS_KEY: "",
  });
});

describe("due times (8.1)", () => {
  it("counts business days past the weekend and hours as hours", () => {
    const friday = new Date("2026-11-06T15:00:00Z");
    expect(addBusinessDays(friday, 1).toISOString()).toBe("2026-11-09T15:00:00.000Z");
    expect(caseDueAt("CHILD_SAFETY", friday).toISOString()).toBe("2026-11-06T16:00:00.000Z");
    expect(caseDueAt("REPORT", friday).toISOString()).toBe("2026-11-11T15:00:00.000Z");
  });
});

describe("cases", () => {
  it("numbers cases per year, logs case_open, and joins an open case for the same item", async () => {
    const now = new Date("2026-11-05T10:00:00Z");
    const first = await openCase({
      type: "CLASSIFIER_HOLD",
      contentItemId: ITEM,
      source: "classifier_hold",
      now,
    });
    expect(first.case).toMatchObject({ number: "SC-2026-000001", severity: 2 });
    const again = await openCase({
      type: "CLASSIFIER_HOLD",
      contentItemId: ITEM,
      source: "classifier_hold",
      now,
    });
    expect(again.joined).toBe(true);
    const child = await openCase({
      type: "CHILD_SAFETY",
      contentItemId: ITEM,
      source: "csam_match",
      now,
    });
    expect(child.case).toMatchObject({ number: "SC-2026-000002", severity: 0 });
    expect(child.case.dueAt.toISOString()).toBe("2026-11-05T11:00:00.000Z");
    expect(db.state.events.map(e => e.action)).toEqual(["case_open", "case_join", "case_open"]);
    expect(await nextNumber("CN", 2026)).toBe("CN-2026-000001");
  });

  it("tries the next number when two cases take the same one", async () => {
    const { Prisma } = await import("@repo/database");
    db.prisma.safetyCase.create.mockClear();
    db.prisma.safetyCase.create.mockRejectedValueOnce(
      new (Prisma as any).PrismaClientKnownRequestError("dup", "P2002")
    );
    const opened = await openCase({ type: "REPORT", source: "test" });
    expect(opened.case.number).toMatch(/^SC-\d{4}-000001$/);
    expect(db.prisma.safetyCase.create).toHaveBeenCalledTimes(2);
  });
});

describe("settings (8.7)", () => {
  it("merges the stored row over the defaults and logs the keys that changed", async () => {
    expect((await getSafetySettings()).claimIdleMinutes).toBe(30);
    const next = await updateSafetySettings(
      { claimIdleMinutes: 45, onCall: [{ name: "Ciaran", phone: "+15551234567" }] },
      9
    );
    expect(next).toMatchObject({ claimIdleMinutes: 45, phashThreshold: 10 });
    expect((await getSafetySettings()).onCall).toHaveLength(1);
    const event = db.state.events.at(-1)!;
    expect(event).toMatchObject({ action: "setting_change", actorId: 9 });
    expect(JSON.stringify(event)).not.toContain("+1555");
  });
});

describe("hash blocklist", () => {
  it("blocks, refuses only active rows, and unblocks with a logged reason", async () => {
    await blockHash({ sha256: "a".repeat(64), phash: "ff00", reason: "copyright", addedById: 3 });
    expect(await findBlockedHash("a".repeat(64))).not.toBeNull();
    const row = db.state.hashes[0]!;
    await unblockHash(row.id, 4, "Decision reversed on appeal");
    expect(await findBlockedHash("a".repeat(64))).toBeNull();
    expect(db.state.hashes).toHaveLength(1);
    expect(db.state.events.map(e => e.action)).toEqual(["hash_block", "hash_unblock"]);
    // Blocking it again turns the same row back on
    await blockHash({ sha256: "a".repeat(64), reason: "policy" });
    expect(await findBlockedHash("a".repeat(64))).toMatchObject({ reason: "policy" });
  });

  it("never unblocks a child safety hash", async () => {
    await blockHash({ sha256: "c".repeat(64), reason: "csam" });
    await expect(unblockHash(db.state.hashes[0]!.id, 4, "reason")).rejects.toBeInstanceOf(
      BlocklistError
    );
    expect(await findBlockedHash("c".repeat(64))).not.toBeNull();
  });

  it("escalates a removable row to csam and never downgrades it again", async () => {
    await blockHash({ sha256: "d".repeat(64), reason: "malware" });
    const escalated = await blockHash({ sha256: "d".repeat(64), reason: "csam" });
    expect(escalated.reason).toBe("csam");
    const later = await blockHash({ sha256: "d".repeat(64), reason: "policy" });
    expect(later.reason).toBe("csam");
    await expect(unblockHash(db.state.hashes[0]!.id, 4, "reason")).rejects.toBeInstanceOf(
      BlocklistError
    );
  });

  it("matches near copies by perceptual hash within the threshold", async () => {
    expect(phashDistance("ff00", "ff01")).toBe(1);
    expect(phashDistance("ff00", "ff")).toBe(Number.POSITIVE_INFINITY);
    await blockHash({ sha256: "b".repeat(64), phash: "ff00ff00", reason: "ncii" });
    expect(await findByPhash("ff00ff01", 2)).toHaveLength(1);
    expect(await findByPhash("00ff00ff", 2)).toHaveLength(0);
  });
});

describe("child safety alert (8.5)", () => {
  async function childCase() {
    return (await openCase({ type: "CHILD_SAFETY", contentItemId: ITEM, source: "csam_match" }))
      .case;
  }

  it("names only the case number and link", () => {
    expect(childSafetyAlertText("SC-2026-000001", "https://admin/safety?case=SC-2026-000001")).toBe(
      "Amped Safety: child safety case SC-2026-000001 is open and needs a safety lead now. https://admin/safety?case=SC-2026-000001"
    );
  });

  it("emails safety leads and on call, and texts on call through Twilio with two retries", async () => {
    const opened = await childCase();
    db.state.users = [
      { email: "lead@amped.test", role: "admin,safety_lead" },
      { email: "notlead@amped.test", role: "safety_leader" },
    ];
    await updateSafetySettings(
      { onCall: [{ name: "Ciaran", email: "oncall@amped.test", phone: "+15551234567" }] },
      1
    );
    Object.assign(env, {
      TWILIO_ACCOUNT_SID: "AC1",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_MESSAGING_SERVICE_SID: "MG1",
    });
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendChildSafetyAlert(opened.id, { wait: async () => {} });
    expect(mail.deliverEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["lead@amped.test", "oncall@amped.test"] })
    );
    expect(fetchMock).toHaveBeenCalledTimes(SMS_ATTEMPTS);
    const body = String(fetchMock.mock.calls[0]![1].body);
    expect(body).toContain("MessagingServiceSid=MG1");
    expect(result).toEqual({ emails: 2, sms: 0, smsFailed: 1 });
    expect(errors).toHaveBeenCalledWith("[safety] ALERT sms failed", expect.anything());
    const logged = db.state.events.at(-1)!;
    expect(logged).toMatchObject({ action: "alert_sent", detail: { emails: 2, smsFailed: 1 } });
    expect(JSON.stringify(logged)).not.toContain("+1555");
    errors.mockRestore();
  });

  it("sends the SMS once when Twilio answers", async () => {
    const opened = await childCase();
    await updateSafetySettings({ onCall: [{ name: "Rob", phone: "+15557654321" }] }, 1);
    Object.assign(env, {
      TWILIO_ACCOUNT_SID: "AC1",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_MESSAGING_SERVICE_SID: "MG1",
    });
    fetchMock.mockResolvedValue({ ok: true, status: 201 });
    const result = await sendChildSafetyAlert(opened.id, { wait: async () => {} });
    expect(result.sms).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("preserveEvidence (8.5)", () => {
  it("refuses and logs when the evidence bucket is not configured", async () => {
    const opened = (await openCase({ type: "CHILD_SAFETY", contentItemId: ITEM, source: "test" }))
      .case;
    db.state.items = [
      {
        id: ITEM,
        publicId: "abcdefghijklmnop",
        userId: 7,
        kind: "IMAGE",
        sha256: "e".repeat(64),
        totalBytes: 10n,
        createdAt: new Date(),
      },
    ];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await preserveEvidence(opened.id, "abcdefghijklmnop")).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(db.state.events.at(-1)).toMatchObject({ action: "evidence_failed" });
    errors.mockRestore();
  });

  it("copies every object under the item's prefixes with a manifest, and logs keys, never a URL", async () => {
    Object.assign(env, {
      CF_ACCOUNT_ID: "acct",
      R2_BUCKET: "amped-content",
      EVIDENCE_R2_ACCESS_KEY_ID: "ek",
      EVIDENCE_R2_SECRET_ACCESS_KEY: "es",
      EVIDENCE_R2_BUCKET: "amped-evidence",
    });
    const evidence = { send: vi.fn(async () => ({})) };
    setEvidenceClientForTests(evidence as never);
    db.state.items = [
      {
        id: ITEM,
        publicId: "abcdefghijklmnop",
        userId: 7,
        kind: "IMAGE",
        sha256: "e".repeat(64),
        totalBytes: 10n,
        createdAt: new Date(),
      },
    ];
    r2.send.mockImplementation(async (command: any) => {
      const input = command.input;
      if ("Prefix" in input) {
        return input.Prefix === "quarantine/abcdefghijklmnop/"
          ? { Contents: [{ Key: "quarantine/abcdefghijklmnop/original.jpg", Size: 10 }] }
          : { Contents: [] };
      }
      return { Body: "bytes", ContentLength: 10, ContentType: "image/jpeg" };
    });
    const opened = (await openCase({ type: "CHILD_SAFETY", contentItemId: ITEM, source: "test" }))
      .case;
    const result = await preserveEvidence(opened.id, "abcdefghijklmnop", {
      now: new Date("2026-11-05T00:00:00Z"),
    });
    expect(result).toMatchObject({ ok: true, streamPending: false });
    expect(evidencePrefixes("x")).toContain("quarantine/x/");
    const puts = evidence.send.mock.calls.map((call: any) => call[0].input);
    expect(puts.map((p: any) => p.Key)).toEqual([
      `cases/${opened.number}/abcdefghijklmnop/quarantine/abcdefghijklmnop/original.jpg`,
      `cases/${opened.number}/abcdefghijklmnop/manifest.json`,
    ]);
    const manifest = JSON.parse(puts[1].Body);
    expect(manifest).toMatchObject({
      uploaderUserId: 7,
      ips: ["203.0.113.9"],
      sha256: "e".repeat(64),
    });
    const logged = db.state.events.at(-1)!;
    expect(logged).toMatchObject({
      action: "evidence_preserved",
      detail: { preservedUntil: "2027-11-05T00:00:00.000Z" },
    });
    expect(JSON.stringify(logged)).not.toMatch(/https?:/);
    setEvidenceClientForTests(null);
  });
});
