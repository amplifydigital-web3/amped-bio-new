/**
 * In memory stand in for the Prisma client, covering the query shapes the messaging
 * services use (Build Board #2, PR 3): equality, gt/gte/lt/lte/not/in/contains,
 * OR/AND, one level of relation filters, composite unique keys, orderBy, take, skip,
 * cursor, increment, upsert, count, aggregate _sum and interactive transactions.
 * Relations are attached to every returned row, so select and include are ignored.
 */

type Row = Record<string, any>;

export class FakeKnownRequestError extends Error {
  constructor(readonly code: string) {
    super(`Prisma error ${code}`);
  }
}
type Rel = { table: string; local: string; foreign: string; many?: boolean };

const RELATIONS: Record<string, Record<string, Rel>> = {
  messageThread: {
    creator: { table: "user", local: "creatorUserId", foreign: "id" },
    fan: { table: "user", local: "fanUserId", foreign: "id" },
    messages: { table: "message", local: "id", foreign: "threadId", many: true },
    reports: { table: "messageReport", local: "id", foreign: "threadId", many: true },
  },
  message: { thread: { table: "messageThread", local: "threadId", foreign: "id" } },
  messageReport: {
    thread: { table: "messageThread", local: "threadId", foreign: "id" },
    reporter: { table: "user", local: "reporterUserId", foreign: "id" },
  },
  follow: {
    follower: { table: "user", local: "follower_id", foreign: "id" },
    creator: { table: "user", local: "creator_id", foreign: "id" },
  },
  creatorMessagingSettings: { user: { table: "user", local: "userId", foreign: "id" } },
  messagingSenderStatus: { user: { table: "user", local: "userId", foreign: "id" } },
  userWallet: {
    creatorPools: { table: "creatorPool", local: "id", foreign: "walletId", many: true },
  },
  // PR 5: groups and inline cards
  telegramGroup: {
    creator: { table: "user", local: "creatorUserId", foreign: "id" },
    members: { table: "telegramGroupMember", local: "id", foreign: "groupId", many: true },
  },
  telegramGroupMember: { group: { table: "telegramGroup", local: "groupId", foreign: "id" } },
  user: {
    messagingSettings: { table: "creatorMessagingSettings", local: "id", foreign: "userId" },
  },
};

const COMPOSITE: Record<string, string[]> = {
  creatorUserId_fanUserId: ["creatorUserId", "fanUserId"],
  threadId_idempotencyKey: ["threadId", "idempotencyKey"],
  creator_id_user_id: ["creator_id", "user_id"],
  userId_creatorUserId: ["userId", "creatorUserId"],
  groupId_telegramUserId: ["groupId", "telegramUserId"],
};

const DEFAULTS: Record<string, () => Row> = {
  messageThread: () => ({
    status: "OPEN",
    lastMessageAt: null,
    creatorReadAt: null,
    fanReadAt: null,
    creatorUnread: 0,
    fanUnread: 0,
    mutedUntil: null,
    blockedAt: null,
    createdAt: new Date(),
  }),
  message: () => ({
    idempotencyKey: null,
    tgMessageId: null,
    tgForwardMessageId: null,
    deliveredAt: null,
    failedReason: null,
    createdAt: new Date(),
  }),
  messageReport: () => ({ messageId: null, note: null, resolvedAt: null, createdAt: new Date() }),
  creatorMessagingSettings: () => ({
    enabled: false,
    ruleKind: "FOLLOWER",
    stakeMin: null,
    dailyNewThreadCap: 50,
    replyFromTelegram: true,
    invitedAt: null,
    pausedAt: null,
    pausedReason: null,
    updatedAt: new Date(),
  }),
  messagingSenderStatus: () => ({
    pausedAt: null,
    pausedUntil: null,
    pausedReason: null,
    updatedAt: new Date(),
  }),
  telegramOutbox: () => ({ status: "PENDING", attempts: 0, createdAt: new Date() }),
  telegramGroup: () => ({
    ruleKind: "POOL_MEMBER",
    stakeMin: null,
    inviteLink: null,
    botIsAdmin: false,
    removeUnverified: false,
    memberCount: 0,
    connectedAt: null,
    lastCheckedAt: null,
    disconnectedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  telegramGroupMember: () => ({
    userId: null,
    approvedAt: null,
    declinedAt: null,
    removedAt: null,
    removedReason: null,
    lastVerifiedAt: null,
    createdAt: new Date(),
  }),
};

function same(a: any, b: any): boolean {
  if (a instanceof Uint8Array && b instanceof Uint8Array) return Buffer.compare(a, b) === 0;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a === "bigint" || typeof b === "bigint") {
    return (
      a !== null && b !== null && a !== undefined && b !== undefined && BigInt(a) === BigInt(b)
    );
  }
  return a === b;
}

function cmp(a: any, b: any): number {
  if (a instanceof Uint8Array && b instanceof Uint8Array) return Buffer.compare(a, b);
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (typeof a === "bigint" || typeof b === "bigint") {
    return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

const OPS = new Set(["gt", "gte", "lt", "lte", "not", "in", "contains", "startsWith"]);

function isOpObject(value: any) {
  return (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !(value instanceof Uint8Array) &&
    Object.keys(value).length > 0 &&
    Object.keys(value).every(key => OPS.has(key))
  );
}

export function createFakeDb() {
  const tables: Record<string, Row[]> = {};
  const table = (name: string) => (tables[name] ??= []);

  function related(model: string, row: Row, name: string) {
    const rel = RELATIONS[model]?.[name];
    if (!rel) return undefined;
    const rows = table(rel.table).filter(other => same(other[rel.foreign], row[rel.local]));
    return rel.many ? rows : (rows[0] ?? null);
  }

  function matchValue(value: any, cond: any): boolean {
    if (isOpObject(cond)) {
      for (const [op, target] of Object.entries(cond)) {
        if (op === "not") {
          if (target === null ? value === null || value === undefined : same(value, target)) {
            return false;
          }
        } else if (op === "in") {
          if (!(target as any[]).some(t => same(value, t))) return false;
        } else if (op === "contains") {
          if (typeof value !== "string" || !value.includes(target as string)) return false;
        } else if (op === "startsWith") {
          if (typeof value !== "string" || !value.startsWith(target as string)) return false;
        } else {
          if (value === null || value === undefined) return false;
          const c = cmp(value, target);
          if (op === "gt" && !(c > 0)) return false;
          if (op === "gte" && !(c >= 0)) return false;
          if (op === "lt" && !(c < 0)) return false;
          if (op === "lte" && !(c <= 0)) return false;
        }
      }
      return true;
    }
    if (cond === null) return value === null || value === undefined;
    return same(value, cond);
  }

  function matches(model: string, row: Row, where: Row | undefined): boolean {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (key === "OR") {
        if (!(cond as Row[]).some(w => matches(model, row, w))) return false;
        continue;
      }
      if (key === "AND") {
        if (!(cond as Row[]).every(w => matches(model, row, w))) return false;
        continue;
      }
      if (COMPOSITE[key]) {
        if (!COMPOSITE[key].every(field => same(row[field], cond[field]))) return false;
        continue;
      }
      const rel = RELATIONS[model]?.[key];
      if (rel && !rel.many) {
        const other = related(model, row, key);
        if (!other || !matches(rel.table, other, cond)) return false;
        continue;
      }
      if (rel?.many && cond?.some) {
        const rows = related(model, row, key) as Row[];
        if (!rows.some(r => matches(rel.table, r, cond.some))) return false;
        continue;
      }
      if (!matchValue(row[key], cond)) return false;
    }
    return true;
  }

  function withRelations(model: string, row: Row, depth = 0): Row {
    const out: Row = { ...row };
    if (depth > 3) return out;
    for (const name of Object.keys(RELATIONS[model] ?? {})) {
      const value = related(model, row, name);
      if (Array.isArray(value)) {
        out[name] = value;
      } else if (value) {
        const rel = RELATIONS[model]![name]!;
        out[name] = withRelations(rel.table, value, depth + 1);
      } else {
        out[name] = null;
      }
    }
    out._count = Object.fromEntries(
      Object.entries(RELATIONS[model] ?? {})
        .filter(([, rel]) => rel.many)
        .map(([name]) => [name, (related(model, row, name) as Row[]).length])
    );
    return out;
  }

  function sortRows(rows: Row[], orderBy: any) {
    if (!orderBy) return rows;
    const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap(o => Object.entries(o));
    return [...rows].sort((a, b) => {
      for (const [field, dir] of keys) {
        const c = cmp(a[field] ?? 0, b[field] ?? 0);
        if (c !== 0) return dir === "desc" ? -c : c;
      }
      return 0;
    });
  }

  function applyData(row: Row, data: Row) {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (value && typeof value === "object" && "increment" in value) row[key] += value.increment;
      else if (value && typeof value === "object" && "decrement" in value)
        row[key] -= value.decrement;
      else row[key] = value;
    }
    if ("updatedAt" in row) row.updatedAt = new Date();
  }

  function delegate(model: string) {
    const findMany = async (args: Row = {}) => {
      let rows = sortRows(
        table(model).filter(row => matches(model, row, args.where)),
        args.orderBy
      );
      if (args.cursor) {
        const index = rows.findIndex(row => matches(model, row, args.cursor));
        rows = index >= 0 ? rows.slice(index) : [];
      }
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      return rows.map(row => withRelations(model, row));
    };
    const findFirst = async (args: Row = {}) => (await findMany({ ...args, take: 1 }))[0] ?? null;
    return {
      findMany,
      findFirst,
      findUnique: findFirst,
      findUniqueOrThrow: async (args: Row) => {
        const row = await findFirst(args);
        if (!row) throw new Error("not found");
        return row;
      },
      count: async (args: Row = {}) =>
        table(model).filter(row => matches(model, row, args.where)).length,
      aggregate: async (args: Row) => {
        const rows = table(model).filter(row => matches(model, row, args.where));
        const _sum: Row = {};
        for (const field of Object.keys(args._sum ?? {})) {
          _sum[field] = rows.length ? rows.reduce((sum, row) => sum + (row[field] ?? 0), 0) : null;
        }
        return { _sum };
      },
      create: async (args: Row) => {
        const row = { ...(DEFAULTS[model]?.() ?? {}), ...args.data };
        for (const [name, fields] of Object.entries(COMPOSITE)) {
          if (!fields.every(field => field in row) || fields.some(f => row[f] === null)) continue;
          const clash = table(model).some(other => fields.every(f => same(other[f], row[f])));
          if (clash && (model !== "message" || name === "threadId_idempotencyKey")) {
            throw new FakeKnownRequestError("P2002");
          }
        }
        table(model).push(row);
        return withRelations(model, row);
      },
      update: async (args: Row) => {
        const row = table(model).find(r => matches(model, r, args.where));
        if (!row) throw new Error(`${model} not found`);
        applyData(row, args.data);
        return withRelations(model, row);
      },
      updateMany: async (args: Row) => {
        const rows = table(model).filter(r => matches(model, r, args.where));
        for (const row of rows) applyData(row, args.data);
        return { count: rows.length };
      },
      upsert: async (args: Row) => {
        const row = table(model).find(r => matches(model, r, args.where));
        if (row) {
          applyData(row, args.update);
          return withRelations(model, row);
        }
        const created = { ...(DEFAULTS[model]?.() ?? {}), ...args.create };
        table(model).push(created);
        return withRelations(model, created);
      },
      delete: async (args: Row) => {
        const index = table(model).findIndex(r => matches(model, r, args.where));
        const [row] = table(model).splice(index, 1);
        return row;
      },
      deleteMany: async (args: Row = {}) => {
        const before = table(model).length;
        tables[model] = table(model).filter(r => !matches(model, r, args.where));
        return { count: before - table(model).length };
      },
    };
  }

  /** Pool stakes for the stakerIds raw query: userId to stake per poolId. */
  const stakes: Array<{ poolId: number; userId: number; amount: bigint }> = [];

  const client: Row = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "$transaction") {
          return async (arg: any) =>
            typeof arg === "function" ? arg(client) : Promise.all(arg as Promise<unknown>[]);
        }
        if (prop === "$queryRaw") {
          return async (query: { values: any[] }) => {
            const [poolIds, userIds, minimum] = query.values as [number[], number[], string?];
            const users = stakes
              .filter(
                s =>
                  poolIds.includes(s.poolId) &&
                  userIds.includes(s.userId) &&
                  (minimum === undefined ? s.amount > 0n : s.amount >= BigInt(minimum))
              )
              .map(s => ({ userId: s.userId }));
            return users;
          };
        }
        if (prop === "then") return undefined;
        return delegate(prop);
      },
    }
  );

  /** Empty every table between tests. */
  function reset() {
    for (const key of Object.keys(tables)) delete tables[key];
    stakes.length = 0;
  }

  return { client, tables, table, stakes, reset };
}

/** Stand in for Prisma.sql and Prisma.join, enough for rules.ts. */
export const fakePrismaNamespace = {
  sql: (_strings: TemplateStringsArray, ...values: unknown[]) => ({ values }),
  join: (values: unknown[]) => values,
  PrismaClientKnownRequestError: FakeKnownRequestError,
};
