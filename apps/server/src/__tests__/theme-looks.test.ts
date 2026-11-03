/**
 * Theme Engine v2 TE-4a (spec 3.9, 3.14): looks and history. The database is
 * an in-memory fake of the three tables the looks code touches.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const db = vi.hoisted(() => {
  const state = {
    themes: [] as Row[],
    versions: [] as Row[],
    users: [] as Row[],
    nextTheme: 1,
    nextVersion: 1,
  };
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Date) && "in" in value) {
        return (value.in as unknown[]).includes(row[key]);
      }
      return row[key] === value;
    });
  const order = (rows: Row[], orderBy: Row | Row[] | undefined) => {
    const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).map(o => {
      const [k, dir] = Object.entries(o)[0]!;
      return { k, dir };
    });
    return [...rows].sort((a, b) => {
      for (const { k, dir } of keys) {
        const av = a[k] instanceof Date ? a[k].getTime() : (a[k] ?? 0);
        const bv = b[k] instanceof Date ? b[k].getTime() : (b[k] ?? 0);
        if (av !== bv) return dir === "desc" ? (bv > av ? 1 : -1) : av > bv ? 1 : -1;
      }
      return 0;
    });
  };
  const pick = (row: Row | undefined, select?: Row) => {
    if (!row || !select) return row ?? null;
    const out: Row = {};
    for (const key of Object.keys(select)) {
      if (key === "_count") {
        out._count = { versions: state.versions.filter(v => v.themeId === row.id).length };
      } else out[key] = row[key];
    }
    return out;
  };
  const theme = {
    findUnique: vi.fn(async ({ where, select }: Row) =>
      pick(
        state.themes.find(t => t.id === where.id),
        select
      )
    ),
    findFirst: vi.fn(async ({ where, orderBy, select }: Row) =>
      pick(
        order(
          state.themes.filter(t => matches(t, where)),
          orderBy
        )[0],
        select
      )
    ),
    findMany: vi.fn(async ({ where, orderBy, select }: Row) =>
      order(
        state.themes.filter(t => matches(t, where)),
        orderBy
      ).map(t => pick(t, select))
    ),
    count: vi.fn(async ({ where }: Row) => state.themes.filter(t => matches(t, where)).length),
    create: vi.fn(async ({ data }: Row) => {
      const row = {
        id: state.nextTheme++,
        description: null,
        kind: "look",
        config_version: 1,
        created_at: new Date(),
        updated_at: new Date(),
        ...data,
      };
      state.themes.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: Row) => {
      const row = state.themes.find(t => t.id === where.id)!;
      Object.assign(row, data, { updated_at: new Date() });
      return row;
    }),
  };
  const themeVersion = {
    findFirst: vi.fn(
      async ({ where, orderBy }: Row) =>
        order(
          state.versions.filter(v => matches(v, where)),
          orderBy
        )[0] ?? null
    ),
    findUnique: vi.fn(
      async ({ where }: Row) => state.versions.find(v => v.id === where.id) ?? null
    ),
    findMany: vi.fn(async ({ where, orderBy, skip = 0, take, select }: Row) => {
      const rows = order(
        state.versions.filter(v => matches(v, where)),
        orderBy
      ).slice(skip, take === undefined ? undefined : skip + take);
      return rows.map(v => pick(v, select));
    }),
    create: vi.fn(async ({ data }: Row) => {
      const row = { id: state.nextVersion++, createdAt: new Date(), ...data };
      state.versions.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: Row) => {
      const row = state.versions.find(v => v.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    deleteMany: vi.fn(async ({ where }: Row) => {
      const before = state.versions.length;
      state.versions = state.versions.filter(v => !matches(v, where));
      return { count: before - state.versions.length };
    }),
  };
  const user = {
    findUnique: vi.fn(async ({ where, select }: Row) =>
      pick(
        state.users.find(u => u.id === where.id),
        select
      )
    ),
    update: vi.fn(async ({ where, data }: Row) => {
      const row = state.users.find(u => u.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
  };
  return { state, prisma: { theme, themeVersion, user } };
});

const flags = vi.hoisted(() => ({ themeSharing: true }));

vi.mock("@repo/database", () => ({ prisma: db.prisma, Prisma: {} }));
vi.mock("../services/featureFlags", () => ({
  isFeatureOn: (key: string) => (flags as Record<string, boolean>)[key] ?? false,
}));
vi.mock("../services/S3Service", () => ({ s3Service: {} }));
vi.mock("../utils/fileUrlResolver", () => ({ getFileUrl: vi.fn() }));
vi.mock("../utils/auth", () => ({ auth: { api: {} } }));

import { themeRouter } from "../trpc/theme";
import {
  LOOK_LIMIT,
  THEME_LIMIT,
  VERSION_LIMIT,
  VERSION_SESSION_MS,
  applicableThemeId,
  copyName,
  currentLookId,
  recordVersion,
} from "../services/theme/looks";

const caller = (sub: number) => themeRouter.createCaller({ user: { sub } } as never);
const config = (buttonColor: string) => ({ buttonColor }) as never;

function seedLook(userId: number, name = "Look", extra: Row = {}): Row {
  const row = {
    id: db.state.nextTheme++,
    user_id: userId,
    name,
    description: null,
    kind: "look",
    config_version: 1,
    config: { buttonColor: "#000000" },
    created_at: new Date(),
    updated_at: new Date(),
    share_level: "private",
    ...extra,
  };
  db.state.themes.push(row);
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  flags.themeSharing = true;
  db.state.themes = [];
  db.state.versions = [];
  db.state.users = [
    { id: 1, theme: null },
    { id: 2, theme: null },
  ];
  db.state.nextTheme = 1;
  db.state.nextVersion = 1;
});

describe("copyName", () => {
  it("adds a counter and skips names in use", () => {
    expect(copyName("Sunset", ["Sunset"])).toBe("Sunset 2");
    expect(copyName("Sunset 2", ["Sunset", "Sunset 2", "sunset 3"])).toBe("Sunset 4");
  });

  it("keeps the copy to 40 characters", () => {
    const long = "A".repeat(40);
    expect(copyName(long, [long])).toHaveLength(40);
    expect(copyName(long, [long]).endsWith(" 2")).toBe(true);
  });
});

describe("recordVersion", () => {
  it("folds saves within one session into one version", async () => {
    const start = new Date("2026-11-03T10:00:00Z");
    await recordVersion(1, config("#111111"), { now: start });
    await recordVersion(1, config("#222222"), { now: new Date(start.getTime() + 60_000) });
    expect(db.state.versions).toHaveLength(1);
    expect(db.state.versions[0]!.config).toEqual({ buttonColor: "#222222" });
  });

  it("starts a new version after the session gap, and always when forced", async () => {
    const start = new Date("2026-11-03T10:00:00Z");
    await recordVersion(1, config("#111111"), { now: start });
    await recordVersion(1, config("#222222"), {
      now: new Date(start.getTime() + VERSION_SESSION_MS + 1),
    });
    await recordVersion(1, config("#333333"), {
      force: true,
      now: new Date(start.getTime() + VERSION_SESSION_MS + 2),
    });
    expect(db.state.versions).toHaveLength(3);
  });

  it("keeps the last 20 versions", async () => {
    const start = Date.parse("2026-11-03T10:00:00Z");
    for (let i = 0; i < VERSION_LIMIT + 5; i += 1) {
      await recordVersion(1, config(`#${String(i).padStart(6, "0")}`), {
        force: true,
        now: new Date(start + i * 1000),
      });
    }
    const kept = db.state.versions.filter(v => v.themeId === 1);
    expect(kept).toHaveLength(VERSION_LIMIT);
    // The oldest five went
    expect(kept.map(v => v.config.buttonColor)).not.toContain("#000004");
    expect(kept.map(v => v.config.buttonColor)).toContain("#000005");
  });
});

describe("applicableThemeId (user.edit)", () => {
  it("allows an own look and a marketplace theme, and clears on 0", async () => {
    const own = seedLook(1);
    const market = seedLook(0, "Market", { user_id: null, kind: "marketplace" });
    expect(await applicableThemeId(1, own.id)).toBe(own.id);
    expect(await applicableThemeId(1, market.id)).toBe(market.id);
    expect(await applicableThemeId(1, 0)).toBeNull();
  });

  it("refuses another creator's look", async () => {
    const theirs = seedLook(2);
    await expect(applicableThemeId(1, theirs.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("currentLookId (applyTheme with themeId 0)", () => {
  it("prefers the applied look, then the look edited last", async () => {
    const older = seedLook(1, "Older", { updated_at: new Date("2026-10-01") });
    const newer = seedLook(1, "Newer", { updated_at: new Date("2026-11-01") });
    expect(await currentLookId(1)).toBe(newer.id);
    db.state.users[0]!.theme = older.id;
    expect(await currentLookId(1)).toBe(older.id);
  });

  it("ignores an applied marketplace theme", async () => {
    const own = seedLook(1);
    const market = seedLook(0, "Market", { user_id: null, kind: "marketplace" });
    db.state.users[0]!.theme = market.id;
    expect(await currentLookId(1)).toBe(own.id);
  });
});

describe("theme router: saves build history", () => {
  const themeInput = (buttonColor: string) => ({
    name: "Mine",
    share_level: "private",
    share_config: {},
    config: { buttonColor } as never,
  });

  it("a new look records its first version and its config version", async () => {
    const created = await caller(1).editTheme({ id: 0, theme: themeInput("#101010") });
    expect(created).toMatchObject({ kind: "look", config_version: 1 });
    expect(db.state.versions.filter(v => v.themeId === created.id)).toHaveLength(1);
  });

  it("autosave folds into the session's version", async () => {
    const look = seedLook(1);
    await caller(1).editTheme({ id: look.id, theme: themeInput("#202020") });
    await caller(1).editTheme({ id: look.id, theme: themeInput("#303030") });
    const versions = db.state.versions.filter(v => v.themeId === look.id);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.config).toEqual({ buttonColor: "#303030" });
  });

  it("applyTheme with themeId 0 writes the named look, not the first row", async () => {
    const first = seedLook(1, "First");
    const second = seedLook(1, "Second");
    await caller(1).applyTheme({ themeId: 0, lookId: second.id, theme: themeInput("#404040") });
    expect(db.state.themes.find(t => t.id === second.id)!.config).toEqual({
      buttonColor: "#404040",
    });
    expect(db.state.themes.find(t => t.id === first.id)!.config).toEqual({
      buttonColor: "#000000",
    });
    expect(db.state.users[0]!.theme).toBe(second.id);
  });

  it("applyTheme refuses another creator's look id", async () => {
    const theirs = seedLook(2);
    await expect(
      caller(1).applyTheme({ themeId: 0, lookId: theirs.id, theme: themeInput("#505050") })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stores the applied id as a number", async () => {
    await caller(1).applyTheme({ themeId: 0, theme: themeInput("#606060") });
    expect(typeof db.state.users[0]!.theme).toBe("number");
  });
});

describe("theme router: looks", () => {
  it("stays closed while themeSharing is off", async () => {
    flags.themeSharing = false;
    await expect(caller(1).looks()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller(1).createLook({ name: "New", config: { buttonColor: "#ffffff" } as never })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists own looks with the limit and the applied look", async () => {
    const mine = seedLook(1, "Mine");
    seedLook(2, "Theirs");
    seedLook(0, "Market", { user_id: null, kind: "marketplace" });
    db.state.users[0]!.theme = mine.id;
    const out = await caller(1).looks();
    expect(out).toMatchObject({ limit: LOOK_LIMIT, count: 1, appliedId: mine.id });
    expect(out.looks.map(l => l.name)).toEqual(["Mine"]);
  });

  it("Save as new look creates, records and applies a look", async () => {
    const out = await caller(1).createLook({
      name: "  Night   drive ",
      config: { buttonColor: "#ffffff" } as never,
    });
    expect(out.name).toBe("Night drive");
    expect(db.state.users[0]!.theme).toBe(out.id);
    expect(db.state.versions.filter(v => v.themeId === out.id)).toHaveLength(1);
  });

  it("refuses an eleventh look with THEME_LIMIT", async () => {
    for (let i = 0; i < LOOK_LIMIT; i += 1) seedLook(1, `Look ${i}`);
    await expect(
      caller(1).createLook({ name: "One more", config: { buttonColor: "#ffffff" } as never })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: THEME_LIMIT });
    await expect(caller(1).duplicate({ id: 1 })).rejects.toMatchObject({ message: THEME_LIMIT });
  });

  it("marketplace rows do not count toward the limit", async () => {
    for (let i = 0; i < LOOK_LIMIT - 1; i += 1) seedLook(1, `Look ${i}`);
    seedLook(1, "Market copy", { kind: "marketplace" });
    await expect(
      caller(1).createLook({ name: "Tenth", config: { buttonColor: "#ffffff" } as never })
    ).resolves.toMatchObject({ name: "Tenth" });
  });

  it("duplicates with a counter name and does not apply the copy", async () => {
    const look = seedLook(1, "Sunset");
    const copy = await caller(1).duplicate({ id: look.id });
    expect(copy.name).toBe("Sunset 2");
    expect(db.state.themes.find(t => t.id === copy.id)!.config).toEqual(look.config);
    expect(db.state.users[0]!.theme).toBeNull();
  });

  it("renames, cut to 40 characters, and refuses another creator's look", async () => {
    const look = seedLook(1, "Old");
    await caller(1).rename({ id: look.id, name: "New name" });
    expect(db.state.themes.find(t => t.id === look.id)!.name).toBe("New name");
    // A longer name is cut to 40; a blank one is refused
    await caller(1).rename({ id: look.id, name: "x".repeat(45) });
    expect(db.state.themes.find(t => t.id === look.id)!.name).toHaveLength(40);
    await expect(caller(1).rename({ id: look.id, name: "   " })).rejects.toThrow();
    await expect(caller(2).rename({ id: look.id, name: "Mine now" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("history lists versions newest first; restore applies and records a version", async () => {
    const look = seedLook(1);
    const t0 = Date.parse("2026-11-03T08:00:00Z");
    await recordVersion(look.id, config("#aaaaaa"), { force: true, now: new Date(t0) });
    await recordVersion(look.id, config("#bbbbbb"), { force: true, now: new Date(t0 + 1000) });
    const { versions } = await caller(1).history({ id: look.id });
    expect(versions.map(v => (v.config as Row).buttonColor)).toEqual(["#bbbbbb", "#aaaaaa"]);

    const oldest = versions.at(-1)!;
    await caller(1).restore({ id: look.id, versionId: oldest.id });
    expect(db.state.themes.find(t => t.id === look.id)!.config).toEqual({ buttonColor: "#aaaaaa" });
    expect(db.state.users[0]!.theme).toBe(look.id);
    expect(db.state.versions.filter(v => v.themeId === look.id)).toHaveLength(3);
  });

  it("restore refuses a version of another look", async () => {
    const a = seedLook(1, "A");
    const b = seedLook(1, "B");
    await recordVersion(b.id, config("#cccccc"), { force: true });
    const versionOfB = db.state.versions.find(v => v.themeId === b.id)!;
    await expect(caller(1).restore({ id: a.id, versionId: versionOfB.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
