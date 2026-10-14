/**
 * QA-008: publish and unpublish an account's own page. The database, session
 * layer, email and cache are mocked, so no network or database is needed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: number; handle: string | null; page_status: "PUBLISHED" | "UNPUBLISHED" };
type Onboarding = { user_id: number; url_confirmed_at: Date | null };

const state = vi.hoisted(() => ({
  users: new Map<number, Row>(),
  onboarding: new Map<number, Onboarding>(),
  follows: [] as { follower_id: number; creator_id: number }[],
  updates: [] as { id: number; data: Record<string, unknown> }[],
}));

vi.mock("../utils/auth", () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));
vi.mock("../utils/cache", () => ({ getRedisClient: () => null }));
vi.mock("../utils/email/email", () => ({
  sendEmailChangeNotice: vi.fn(),
  sendEmailChangeVerification: vi.fn(),
}));
vi.mock("../services/rns", () => ({ assertRnsBinding: vi.fn() }));
vi.mock("@repo/database", () => {
  type Where = {
    OR?: { handle: string }[];
    NOT?: { id: number };
  };
  const user = {
    findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
      const row = state.users.get(where.id);
      return row ? { ...row } : null;
    }),
    findFirst: vi.fn(async ({ where }: { where: Where }) => {
      const handles = new Set((where.OR ?? []).map(clause => clause.handle));
      for (const row of state.users.values()) {
        if (where.NOT && row.id === where.NOT.id) continue;
        if (row.handle && handles.has(row.handle)) return { id: row.id };
      }
      return null;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: number }; data: Partial<Omit<Row, "id">> }) => {
        state.updates.push({ id: where.id, data });
        const row = state.users.get(where.id)!;
        Object.assign(row, data);
        return row;
      }
    ),
  };
  const userOnboarding = {
    findUnique: vi.fn(
      async ({ where }: { where: { user_id: number } }) =>
        state.onboarding.get(where.user_id) ?? null
    ),
    create: vi.fn(async ({ data }: { data: Onboarding }) => {
      state.onboarding.set(data.user_id, data);
      return data;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { user_id: number }; data: Partial<Onboarding> }) => {
        const row = state.onboarding.get(where.user_id)!;
        Object.assign(row, data);
        return row;
      }
    ),
  };
  const client = { user, userOnboarding };
  class PrismaClientKnownRequestError extends Error {
    code = "";
  }
  return {
    Prisma: { PrismaClientKnownRequestError },
    prisma: {
      ...client,
      $transaction: vi.fn(async (fn: (tx: typeof client) => unknown) => fn(client)),
    },
  };
});

import { userRouter } from "../trpc/user";
import { isPublishCardSnoozed } from "../trpc/onboarding";

const ctx = (sub?: number) =>
  ({
    req: {} as never,
    res: {} as never,
    user:
      sub === undefined
        ? undefined
        : { sub, email: "a@b.co", role: "user", wallet: null, poolAddresses: {} },
  }) as Parameters<typeof userRouter.createCaller>[0];

beforeEach(() => {
  state.users.clear();
  state.onboarding.clear();
  state.updates.length = 0;
  state.follows = [{ follower_id: 7, creator_id: 9 }];
  state.users.set(7, { id: 7, handle: "jordan-ellis-4821", page_status: "UNPUBLISHED" });
  state.users.set(9, { id: 9, handle: "maya", page_status: "PUBLISHED" });
  state.onboarding.set(7, { user_id: 7, url_confirmed_at: null });
});

describe("user.publishPage", () => {
  it("publishes with the current handle and marks the URL step done", async () => {
    const result = await userRouter.createCaller(ctx(7)).publishPage();
    expect(result).toEqual({ handle: "jordan-ellis-4821", pageStatus: "PUBLISHED", changed: true });
    expect(state.users.get(7)?.page_status).toBe("PUBLISHED");
    expect(state.onboarding.get(7)?.url_confirmed_at).toBeInstanceOf(Date);
  });

  it("publishes with a new handle, normalized like Account (@ prefix dropped)", async () => {
    const result = await userRouter.createCaller(ctx(7)).publishPage({ handle: "@jordan" });
    expect(result.handle).toBe("jordan");
    expect(state.users.get(7)).toMatchObject({ handle: "jordan", page_status: "PUBLISHED" });
  });

  it("a taken handle shows the Account error and publishes nothing", async () => {
    await expect(userRouter.createCaller(ctx(7)).publishPage({ handle: "maya" })).rejects.toThrow(
      "This handle is already taken"
    );
    expect(state.users.get(7)).toMatchObject({
      handle: "jordan-ellis-4821",
      page_status: "UNPUBLISHED",
    });
    expect(state.updates).toEqual([]);
  });

  it("an invalid handle is refused before any write", async () => {
    await expect(userRouter.createCaller(ctx(7)).publishPage({ handle: "a b" })).rejects.toThrow();
    expect(state.updates).toEqual([]);
  });

  it("publishing twice is a no-op, not an error", async () => {
    const caller = userRouter.createCaller(ctx(7));
    await caller.publishPage();
    const second = await caller.publishPage({ handle: "jordan-ellis-4821" });
    expect(second).toEqual({
      handle: "jordan-ellis-4821",
      pageStatus: "PUBLISHED",
      changed: false,
    });
    expect(state.updates).toHaveLength(1);
  });
});

describe("user.unpublishPage", () => {
  it("sets UNPUBLISHED and keeps follows", async () => {
    const result = await userRouter.createCaller(ctx(9)).unpublishPage();
    expect(result).toEqual({ handle: "maya", pageStatus: "UNPUBLISHED", changed: true });
    expect(state.users.get(9)?.page_status).toBe("UNPUBLISHED");
    expect(state.follows).toEqual([{ follower_id: 7, creator_id: 9 }]);
  });

  it("unpublishing an unpublished page is a no-op", async () => {
    const result = await userRouter.createCaller(ctx(7)).unpublishPage();
    expect(result.changed).toBe(false);
    expect(state.updates).toEqual([]);
  });
});

describe("owner only", () => {
  it("signed out callers cannot publish or unpublish", async () => {
    await expect(userRouter.createCaller(ctx()).publishPage()).rejects.toThrow();
    await expect(userRouter.createCaller(ctx()).unpublishPage()).rejects.toThrow();
    expect(state.updates).toEqual([]);
  });

  it("a caller only ever changes their own page", async () => {
    await userRouter.createCaller(ctx(7)).publishPage();
    await userRouter.createCaller(ctx(7)).unpublishPage();
    expect(state.updates.every(update => update.id === 7)).toBe(true);
    expect(state.users.get(9)?.page_status).toBe("PUBLISHED");
  });
});

describe("Make your own page card snooze", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  it("shows when never dismissed", () => {
    expect(isPublishCardSnoozed(null, now)).toBe(false);
  });
  it("hides for 30 days after Not now", () => {
    expect(isPublishCardSnoozed(new Date("2026-09-08T13:00:00Z"), now)).toBe(true);
    expect(isPublishCardSnoozed(new Date("2026-09-07T11:00:00Z"), now)).toBe(false);
  });
});
