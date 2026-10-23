/**
 * RNS name expiry emails: the stage rule, the subject lines, and the sweep
 * (verified email only, opt out, one email per name and stage, retry after a
 * failed send).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  userWallet: { findMany: vi.fn() },
  rnsExpiryNotice: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
}));
const transport = vi.hoisted(() => ({ deliverEmail: vi.fn() }));

vi.mock("@repo/database", () => ({ prisma: db }));
vi.mock("../utils/email/transport", () => transport);
vi.mock("../env", () => ({
  env: {
    SUBGRAPH_URL: "https://subgraph.test/revonames",
    APP_URL: "https://app.staging.amped.bio",
    LANDINGPAGE_URL: "https://staging.amped.bio",
    RNS_EXPIRY_EMAILS: true,
  },
}));

import {
  extendUrl,
  fetchExpiringNames,
  rnsExpiryStage,
  rnsExpirySubject,
  sweepRnsExpiry,
} from "../services/rnsExpiry";

const DAY = 86_400;
const GRACE = 86_400;
const NOW = 1_800_000_000;
const OWNER = "0xabc0000000000000000000000000000000000001";

function subgraphReply(rows: { labelName: string; owner: string; expiry: number }[]) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        data: {
          revoNames: rows.map(row => ({
            labelName: row.labelName,
            owner: row.owner,
            expiryDateWithGrace: String(row.expiry + GRACE),
          })),
        },
      }),
  } as unknown as Response;
}

function wallet(overrides: Partial<{ verified: boolean; reminders: boolean | null }> = {}) {
  return {
    address: OWNER.toUpperCase().replace("0X", "0x"),
    user: {
      id: 7,
      email: "rob@example.com",
      email_verified: overrides.verified ?? true,
      name: "Rob Frasca",
      notificationPreferences:
        overrides.reminders === undefined ? [] : [{ rnsRemindersEnabled: overrides.reminders }],
    },
  };
}

describe("rnsExpiryStage", () => {
  it("is null more than 30 days out", () => {
    expect(rnsExpiryStage(NOW + 31 * DAY, NOW)).toBeNull();
  });

  it("walks the 30, 7 and 1 day stages", () => {
    expect(rnsExpiryStage(NOW + 30 * DAY, NOW)).toBe("d30");
    expect(rnsExpiryStage(NOW + 8 * DAY, NOW)).toBe("d30");
    expect(rnsExpiryStage(NOW + 7 * DAY, NOW)).toBe("d7");
    expect(rnsExpiryStage(NOW + 2 * DAY, NOW)).toBe("d7");
    expect(rnsExpiryStage(NOW + DAY, NOW)).toBe("d1");
    expect(rnsExpiryStage(NOW + 60, NOW)).toBe("d1");
  });

  it("is grace for the day after expiry, then null once released", () => {
    expect(rnsExpiryStage(NOW, NOW)).toBe("grace");
    expect(rnsExpiryStage(NOW - GRACE + 60, NOW)).toBe("grace");
    expect(rnsExpiryStage(NOW - GRACE, NOW)).toBeNull();
  });
});

describe("rnsExpirySubject", () => {
  it("names the days left and the grace deadline", () => {
    expect(rnsExpirySubject("rob.revotest.eth", "d7", NOW + 7 * DAY, NOW)).toBe(
      "Your RNS name rob.revotest.eth expires in 7 days"
    );
    expect(rnsExpirySubject("rob.revotest.eth", "d1", NOW + 3600, NOW)).toBe(
      "Your RNS name rob.revotest.eth expires in 1 day"
    );
    expect(rnsExpirySubject("rob.revotest.eth", "grace", NOW - 60, NOW)).toBe(
      "rob.revotest.eth has expired. Renew it by tomorrow to keep it"
    );
  });
});

describe("extendUrl", () => {
  it("opens the extend flow on the name page", () => {
    expect(extendUrl("robfrasca")).toBe(
      "https://app.staging.amped.bio/wallet?tab=rns&name=robfrasca&flow=extend"
    );
  });
});

describe("fetchExpiringNames", () => {
  it("reads the registration expiry from the grace end and lowercases owners", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        subgraphReply([{ labelName: "robfrasca", owner: OWNER.toUpperCase(), expiry: NOW + DAY }])
      );
    const names = await fetchExpiringNames(NOW, fetcher);
    expect(names).toEqual([
      { label: "robfrasca", owner: OWNER.toUpperCase().toLowerCase(), expiry: NOW + DAY },
    ]);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.variables.from).toBe(String(NOW));
    expect(body.variables.to).toBe(String(NOW + 30 * DAY + GRACE));
  });

  it("returns null when the subgraph fails", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "upstream is down",
    } as unknown as Response);
    expect(await fetchExpiringNames(NOW, fetcher)).toBeNull();
  });

  it("logs the errors of a GraphQL answer that carries no data", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ errors: [{ message: "Cannot query field revoNames" }] }),
    } as unknown as Response);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await fetchExpiringNames(NOW, fetcher)).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("sweepRnsExpiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.rnsExpiryNotice.create.mockResolvedValue({});
    db.rnsExpiryNotice.findUnique.mockResolvedValue(null);
    db.rnsExpiryNotice.update.mockResolvedValue({ attempts: 1 });
    db.rnsExpiryNotice.updateMany.mockResolvedValue({ count: 1 });
    db.rnsExpiryNotice.delete.mockResolvedValue({});
    transport.deliverEmail.mockResolvedValue({ transport: "smtp", id: "1", detail: null });
  });

  function stubSubgraph(rows: { labelName: string; owner: string; expiry: number }[]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(subgraphReply(rows)));
  }

  it("emails a verified owner once for the current stage", async () => {
    stubSubgraph([{ labelName: "robfrasca", owner: OWNER, expiry: NOW + 5 * DAY }]);
    db.userWallet.findMany.mockResolvedValue([wallet()]);

    expect(await sweepRnsExpiry(NOW)).toBe(1);
    expect(db.rnsExpiryNotice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 7,
        label: "robfrasca",
        expiry: NOW + 5 * DAY,
        stage: "d7",
      }),
    });
    const email = transport.deliverEmail.mock.calls[0][0];
    expect(email.to).toEqual(["rob@example.com"]);
    expect(email.subject).toBe("Your RNS name robfrasca.revotest.eth expires in 5 days");
    expect(email.html).toContain("flow=extend");
    expect(email.html).toContain("Turn off name reminders");
  });

  it("skips names already emailed for that stage", async () => {
    stubSubgraph([{ labelName: "robfrasca", owner: OWNER, expiry: NOW + 5 * DAY }]);
    db.userWallet.findMany.mockResolvedValue([wallet()]);
    db.rnsExpiryNotice.create.mockRejectedValue({ code: "P2002" });

    expect(await sweepRnsExpiry(NOW)).toBe(0);
    expect(transport.deliverEmail).not.toHaveBeenCalled();
  });

  it("skips unverified emails and owners who turned reminders off", async () => {
    stubSubgraph([{ labelName: "robfrasca", owner: OWNER, expiry: NOW + 5 * DAY }]);
    db.userWallet.findMany.mockResolvedValue([wallet({ verified: false })]);
    expect(await sweepRnsExpiry(NOW)).toBe(0);

    db.userWallet.findMany.mockResolvedValue([wallet({ reminders: false })]);
    expect(await sweepRnsExpiry(NOW)).toBe(0);
    expect(transport.deliverEmail).not.toHaveBeenCalled();
  });

  it("sends when the reminder setting was never touched", async () => {
    stubSubgraph([{ labelName: "robfrasca", owner: OWNER, expiry: NOW + 5 * DAY }]);
    db.userWallet.findMany.mockResolvedValue([wallet({ reminders: null })]);
    expect(await sweepRnsExpiry(NOW)).toBe(1);
  });

  it("skips names with no Amped.Bio wallet owner", async () => {
    stubSubgraph([{ labelName: "stranger", owner: "0xdef", expiry: NOW + 5 * DAY }]);
    db.userWallet.findMany.mockResolvedValue([]);
    expect(await sweepRnsExpiry(NOW)).toBe(0);
  });

  it("marks the notice failed when the send fails, so the next sweep retries it", async () => {
    stubSubgraph([{ labelName: "robfrasca", owner: OWNER, expiry: NOW - 60 }]);
    db.userWallet.findMany.mockResolvedValue([wallet()]);
    transport.deliverEmail.mockRejectedValue(new Error("smtp down"));

    expect(await sweepRnsExpiry(NOW)).toBe(0);
    expect(db.rnsExpiryNotice.update).toHaveBeenCalledWith({
      where: {
        userId_label_expiry_stage: {
          userId: 7,
          label: "robfrasca",
          expiry: NOW - 60,
          stage: "grace",
        },
      },
      data: { failedAt: new Date(NOW * 1000) },
      select: { attempts: true },
    });
  });

  it("keeps sweeping when one notice row cannot be written", async () => {
    stubSubgraph([
      { labelName: "toolong", owner: OWNER, expiry: NOW + 5 * DAY },
      { labelName: "robfrasca", owner: OWNER, expiry: NOW + 5 * DAY },
    ]);
    db.userWallet.findMany.mockResolvedValue([wallet()]);
    db.rnsExpiryNotice.create.mockImplementation((args: { data: { label: string } }) =>
      args.data.label === "toolong"
        ? Promise.reject(new Error("Data too long for column 'label'"))
        : Promise.resolve({})
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await sweepRnsExpiry(NOW)).toBe(1);
    expect(transport.deliverEmail).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("retries a failed notice once the backoff passed", async () => {
    stubSubgraph([{ labelName: "robfrasca", owner: OWNER, expiry: NOW - 60 }]);
    db.userWallet.findMany.mockResolvedValue([wallet()]);
    db.rnsExpiryNotice.create.mockRejectedValue({ code: "P2002" });
    db.rnsExpiryNotice.findUnique.mockResolvedValue({
      attempts: 1,
      failedAt: new Date((NOW - 2 * 3600) * 1000),
    });

    expect(await sweepRnsExpiry(NOW)).toBe(1);
    expect(db.rnsExpiryNotice.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        label: "robfrasca",
        expiry: NOW - 60,
        stage: "grace",
        attempts: 1,
        failedAt: { not: null },
      },
      data: { attempts: { increment: 1 }, failedAt: null },
    });
  });

  it("waits for the backoff before trying a failed notice again", async () => {
    stubSubgraph([{ labelName: "robfrasca", owner: OWNER, expiry: NOW - 60 }]);
    db.userWallet.findMany.mockResolvedValue([wallet()]);
    db.rnsExpiryNotice.create.mockRejectedValue({ code: "P2002" });
    db.rnsExpiryNotice.findUnique.mockResolvedValue({
      attempts: 1,
      failedAt: new Date((NOW - 60) * 1000),
    });

    expect(await sweepRnsExpiry(NOW)).toBe(0);
    expect(db.rnsExpiryNotice.updateMany).not.toHaveBeenCalled();
    expect(transport.deliverEmail).not.toHaveBeenCalled();
  });

  it("abandons a notice that used up its attempts", async () => {
    stubSubgraph([{ labelName: "robfrasca", owner: OWNER, expiry: NOW - 60 }]);
    db.userWallet.findMany.mockResolvedValue([wallet()]);
    db.rnsExpiryNotice.create.mockRejectedValue({ code: "P2002" });
    db.rnsExpiryNotice.findUnique.mockResolvedValue({
      attempts: 3,
      failedAt: new Date((NOW - 10 * 3600) * 1000),
    });

    expect(await sweepRnsExpiry(NOW)).toBe(0);
    expect(db.rnsExpiryNotice.updateMany).not.toHaveBeenCalled();
    expect(transport.deliverEmail).not.toHaveBeenCalled();
  });
});
