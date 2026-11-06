/**
 * In memory stand in for the Prisma client, covering the query shapes the
 * reserved handles services use (Build Board D2, RH2): equality,
 * gt/gte/lt/lte/not/in/contains/startsWith, OR, composite unique keys,
 * single field unique constraints (P2002), orderBy, take, skip, distinct,
 * increment, upsert, count, interactive transactions, and the two collision
 * queries in services/handles/collisions.ts. Relations are attached to every
 * returned row, so select and include are ignored.
 */

type Row = Record<string, any>;

export class FakeKnownRequestError extends Error {
  constructor(readonly code: string) {
    super(`Prisma error ${code}`);
  }
}

type Rel = { table: string; local: string; foreign: string; many?: boolean };

const RELATIONS: Record<string, Record<string, Rel>> = {
  user: {
    reservedHandle: { table: "reservedHandle", local: "id", foreign: "assignedUserId" },
    followsReceived: { table: "follow", local: "id", foreign: "creator_id", many: true },
    sessions: { table: "session", local: "id", foreign: "userId", many: true },
    wallet: { table: "userWallet", local: "id", foreign: "userId" },
  },
  userWallet: {
    creatorPools: { table: "creatorPool", local: "id", foreign: "walletId", many: true },
  },
  reservedHandle: { assignedUser: { table: "user", local: "assignedUserId", foreign: "id" } },
  handleNotice: { user: { table: "user", local: "userId", foreign: "id" } },
  handleRedirect: { user: { table: "user", local: "userId", foreign: "id" } },
};

const COMPOSITE: Record<string, string[]> = {
  userId_reservedWord: ["userId", "reservedWord"],
};

const UNIQUE: Record<string, string[]> = {
  user: ["handle"],
  reservedHandle: ["word", "assignedUserId"],
  handleRedirect: ["oldHandle"],
  handleNotice: [],
};

const DEFAULTS: Record<string, () => Row> = {
  user: () => ({ page_status: "PUBLISHED", name: "Someone", email: "someone@example.com" }),
  reservedHandle: () => ({
    expiresAt: null,
    assignedUserId: null,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  handleNotice: () => ({
    deadline: null,
    extensions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  handleRedirect: () => ({ hits: 0, createdAt: new Date() }),
  adminAuditLog: () => ({ createdAt: new Date() }),
};

function same(a: any, b: any): boolean {
  if (a instanceof Uint8Array && b instanceof Uint8Array) return Buffer.compare(a, b) === 0;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function cmp(a: any, b: any): number {
  if (a instanceof Uint8Array && b instanceof Uint8Array) return Buffer.compare(a, b);
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
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

function skeleton(handle: string) {
  return handle.toLowerCase().replace(/[-_]/g, "");
}

export function createFakeHandlesDb() {
  const tables: Record<string, Row[]> = {};
  const table = (name: string) => (tables[name] ??= []);

  function related(model: string, row: Row, name: string) {
    const rel = RELATIONS[model]?.[name];
    if (!rel) return undefined;
    const rows = table(rel.table).filter(
      other => other[rel.foreign] !== null && same(other[rel.foreign], row[rel.local])
    );
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
      if (key === "NOT") {
        if (matches(model, row, cond)) return false;
        continue;
      }
      if (COMPOSITE[key]) {
        if (!COMPOSITE[key].every(field => same(row[field], cond[field]))) return false;
        continue;
      }
      if (!matchValue(row[key], cond)) return false;
    }
    return true;
  }

  function withRelations(model: string, row: Row, depth = 0): Row {
    const out: Row = { ...row };
    if (depth > 1) return out;
    for (const [name, rel] of Object.entries(RELATIONS[model] ?? {})) {
      const value = related(model, row, name);
      if (Array.isArray(value)) out[name] = value;
      else out[name] = value ? withRelations(rel.table, value, depth + 1) : null;
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
        const av = a[field];
        const bv = b[field];
        // MySQL puts NULL first in ascending order
        if (av == null && bv != null) return dir === "desc" ? 1 : -1;
        if (bv == null && av != null) return dir === "desc" ? -1 : 1;
        const c = av == null ? 0 : cmp(av, bv);
        if (c !== 0) return dir === "desc" ? -c : c;
      }
      return 0;
    });
  }

  function assertUnique(model: string, row: Row, self?: Row) {
    for (const field of UNIQUE[model] ?? []) {
      if (row[field] === null || row[field] === undefined) continue;
      const clash = table(model).some(other => other !== self && same(other[field], row[field]));
      if (clash) throw new FakeKnownRequestError("P2002");
    }
    for (const fields of Object.values(COMPOSITE)) {
      if (!fields.every(field => field in row)) continue;
      const clash = table(model).some(
        other => other !== self && fields.every(f => same(other[f], row[f]))
      );
      if (clash) throw new FakeKnownRequestError("P2002");
    }
  }

  function applyData(model: string, row: Row, data: Row) {
    const next = { ...row };
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (value && typeof value === "object" && "increment" in value) next[key] += value.increment;
      else next[key] = value;
    }
    if ("updatedAt" in next) next.updatedAt = new Date();
    assertUnique(model, next, row);
    Object.assign(row, next);
  }

  function delegate(model: string) {
    const findMany = async (args: Row = {}) => {
      let rows = sortRows(
        table(model).filter(row => matches(model, row, args.where)),
        args.orderBy
      );
      if (args.distinct) {
        const seen = new Set<string>();
        rows = rows.filter(row => {
          const key = JSON.stringify((args.distinct as string[]).map(field => row[field]));
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
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
      count: async (args: Row = {}) =>
        table(model).filter(row => matches(model, row, args.where)).length,
      create: async (args: Row) => {
        const row = { ...(DEFAULTS[model]?.() ?? {}), ...args.data };
        assertUnique(model, row);
        table(model).push(row);
        return withRelations(model, row);
      },
      update: async (args: Row) => {
        const row = table(model).find(r => matches(model, r, args.where));
        if (!row) throw new FakeKnownRequestError("P2025");
        applyData(model, row, args.data);
        return withRelations(model, row);
      },
      updateMany: async (args: Row) => {
        const rows = table(model).filter(r => matches(model, r, args.where));
        for (const row of rows) applyData(model, row, args.data);
        return { count: rows.length };
      },
      upsert: async (args: Row) => {
        const row = table(model).find(r => matches(model, r, args.where));
        if (row) {
          applyData(model, row, args.update);
          return withRelations(model, row);
        }
        const created = { ...(DEFAULTS[model]?.() ?? {}), ...args.create };
        assertUnique(model, created);
        table(model).push(created);
        return withRelations(model, created);
      },
      delete: async (args: Row) => {
        const index = table(model).findIndex(r => matches(model, r, args.where));
        if (index < 0) throw new FakeKnownRequestError("P2025");
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

  /** The two collision queries: exact skeleton, or prefix form LIKE pattern. */
  async function queryRaw(strings: TemplateStringsArray, ...values: any[]) {
    const sql = strings.join("?");
    const users = [...table("user")].sort((a, b) => a.id - b.id);
    const limit = values.find(value => value && typeof value === "object" && "limit" in value)
      ?.limit as number | undefined;
    let ids: number[];
    if (sql.includes("REPLACE(REPLACE(")) {
      const wanted = values[0] as string;
      ids = users.filter(user => user.handle && skeleton(user.handle) === wanted).map(u => u.id);
    } else if (sql.includes("LIKE")) {
      const prefix = String(values[0]).replace(/%$/, "").replace(/\\(.)/g, "$1");
      ids = users
        .filter(user => user.handle?.toLowerCase().replace(/_/g, "-").startsWith(prefix))
        .map(u => u.id);
    } else {
      throw new Error(`Unexpected raw query: ${sql}`);
    }
    return (limit === undefined ? ids : ids.slice(0, limit)).map(id => ({ id }));
  }

  const client: Row = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "$transaction") {
          return async (arg: any) => {
            if (typeof arg !== "function") return Promise.all(arg as Promise<unknown>[]);
            // Roll back on a throw, as a real transaction does
            const snapshot = Object.fromEntries(
              Object.entries(tables).map(([name, rows]) => [name, rows.map(row => ({ ...row }))])
            );
            try {
              return await arg(client);
            } catch (error) {
              for (const key of Object.keys(tables)) delete tables[key];
              Object.assign(tables, snapshot);
              throw error;
            }
          };
        }
        if (prop === "$queryRaw") return queryRaw;
        if (prop === "then") return undefined;
        return delegate(prop);
      },
    }
  );

  function reset() {
    for (const key of Object.keys(tables)) delete tables[key];
  }

  return { client, tables, table, reset };
}

/** Stand in for Prisma.sql, Prisma.empty and the error and JSON classes */
export const fakePrismaNamespace = {
  sql: (_strings: TemplateStringsArray, ...values: unknown[]) => ({ limit: values[0] }),
  empty: { empty: true },
  JsonNull: null,
  PrismaClientKnownRequestError: FakeKnownRequestError,
};
