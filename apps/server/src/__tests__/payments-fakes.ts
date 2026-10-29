/**
 * In memory fakes for the AmpedPay admin tests (payments-admin.test.ts and
 * payments-onchain.test.ts): site_settings, admin_changes, users and two factor rows, and
 * better-auth's verifyTOTP. Test files mock @repo/database and ../utils/auth with these.
 */
import { vi } from "vitest";

export type Row = Record<string, any>;

export const store = {
  settings: new Map<string, Row>(),
  changes: [] as Row[],
  users: [] as Row[],
  twoFactor: new Map<number, Row>(),
};

export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (
      condition &&
      typeof condition === "object" &&
      !(condition instanceof Date) &&
      !Buffer.isBuffer(condition)
    ) {
      if ("in" in condition) return condition.in.includes(value);
      if ("lt" in condition) return value < condition.lt;
      if ("lte" in condition) return value !== null && value <= condition.lte;
      if ("not" in condition) return value !== condition.not;
      return true;
    }
    if (Buffer.isBuffer(condition)) return Buffer.isBuffer(value) && condition.equals(value);
    return value === condition;
  });
}

function byId(id: Buffer) {
  return store.changes.find(row => Buffer.from(row.id).equals(id));
}

export const db: Row = {
  siteSettings: {
    findMany: vi.fn(async ({ where }: Row) =>
      [...store.settings.values()].filter(row => where.setting_key.in.includes(row.setting_key))
    ),
    findUnique: vi.fn(async ({ where }: Row) => store.settings.get(where.setting_key) ?? null),
    upsert: vi.fn(async ({ where, create, update }: Row) => {
      const existing = store.settings.get(where.setting_key);
      const row = existing ? { ...existing, ...update } : { ...create };
      store.settings.set(where.setting_key, row);
      return row;
    }),
  },
  adminChange: {
    create: vi.fn(async ({ data }: Row) => {
      const row = {
        effectiveAt: null,
        approvedById: null,
        decisionNote: null,
        safeTxHash: null,
        txHash: null,
        chainId: null,
        decidedAt: null,
        appliedAt: null,
        createdAt: new Date(),
        ...data,
      };
      store.changes.push(row);
      return row;
    }),
    findFirst: vi.fn(
      async ({ where }: Row) => store.changes.find(row => matches(row, where)) ?? null
    ),
    findUnique: vi.fn(async ({ where }: Row) => byId(where.id) ?? null),
    findMany: vi.fn(async ({ where, take, orderBy }: Row) => {
      const rows = store.changes
        .filter(row => matches(row, where))
        .sort((a, b) =>
          orderBy?.createdAt === "asc"
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime()
        );
      return take ? rows.slice(0, take) : rows;
    }),
    update: vi.fn(async ({ where, data }: Row) => {
      const row = byId(where.id);
      if (!row) throw new Error("Record not found");
      Object.assign(row, data);
      return row;
    }),
    updateMany: vi.fn(async ({ where, data }: Row) => {
      let count = 0;
      for (const row of store.changes) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    }),
  },
  user: {
    findMany: vi.fn(async ({ where }: Row) => {
      if (where.handle) return store.users.filter(user => where.handle.in.includes(user.handle));
      return store.users.filter(user => where.id.in.includes(user.id));
    }),
  },
  twoFactor: {
    findUnique: vi.fn(async ({ where }: Row) => store.twoFactor.get(where.userId) ?? null),
  },
};
db.$transaction = vi.fn(async (fn: (tx: Row) => unknown) => fn(db));

export const verifyTOTP = vi.fn();

export const JOHN = 11;
export const ROB = 12;
export const PLAIN = 13;

/** Clears every table and seeds John and Rob (payments admins) and a plain admin. */
export function resetPaymentsFakes() {
  store.settings.clear();
  store.changes.length = 0;
  store.users.splice(
    0,
    store.users.length,
    { id: JOHN, handle: "john" },
    { id: ROB, handle: "rob" },
    { id: PLAIN, handle: "ops" },
    { id: 40, handle: "maya_lin" },
    { id: 41, handle: "dj-kai" }
  );
  store.twoFactor.clear();
  store.twoFactor.set(JOHN, { verified: true });
  store.twoFactor.set(ROB, { verified: true });
  store.twoFactor.set(PLAIN, { verified: true });
  verifyTOTP.mockImplementation(async ({ body }: Row) => {
    if (body.code === "123456") return { token: "session-token", user: {} };
    throw new Error("INVALID_CODE");
  });
}
