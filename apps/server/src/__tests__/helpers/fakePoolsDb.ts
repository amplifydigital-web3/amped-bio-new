/**
 * In memory stand in for the pool tables used by services/poolStats.ts and
 * the pool list (Build Board D7). Transactions run one at a time, like rows
 * locked with SELECT ... FOR UPDATE, so concurrent writers serialize.
 */
export class FakeDecimal {
  private readonly value: string;
  constructor(value: string | number | bigint) {
    this.value = String(value);
  }
  toFixed(): string {
    return this.value;
  }
  toString(): string {
    return this.value;
  }
}

export interface FakePool {
  id: number;
  walletId: number;
  chainId: string;
  name: string | null;
  description: string | null;
  poolAddress: string | null;
  revoStaked: string;
  fans: number;
  hidden: boolean;
  creatorStakeWei: FakeDecimal;
  fanStakeWei: FakeDecimal;
  totalStakeWei: FakeDecimal;
  activeFans: number;
  statsUpdatedAt: Date | null;
  createdAt: Date;
  image_file_id: number | null;
}

export interface FakeStake {
  id: number;
  userWalletId: number;
  poolId: number;
  stakeAmount: string;
  updatedAt: Date | null;
}

export interface FakeEvent {
  id: number;
  userWalletId: number;
  poolId: number;
  amount: string;
  eventType: string;
  transactionHash: string;
  createdAt: Date;
}

function pick<T extends object>(row: T, select?: Record<string, unknown>) {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) out[key] = (row as Record<string, unknown>)[key];
  return out;
}

export function createFakePoolsDb() {
  const pools = new Map<number, FakePool>();
  const stakes: FakeStake[] = [];
  const events: FakeEvent[] = [];
  let stakeId = 1;
  let eventId = 1;
  let chain: Promise<unknown> = Promise.resolve();

  const stakeFor = (userWalletId: number, poolId: number) =>
    stakes.find(s => s.userWalletId === userWalletId && s.poolId === poolId);

  const client: any = {
    creatorPool: {
      findUnique: async ({ where, select }: any) => {
        const pool = pools.get(where.id);
        return pool ? pick(pool, select) : null;
      },
      findMany: async ({ where = {}, select }: any = {}) =>
        [...pools.values()]
          .filter(p => !where.chainId || p.chainId === where.chainId)
          .sort((a, b) => a.id - b.id)
          .map(p => pick(p, select)),
      update: async ({ where, data }: any) => {
        const pool = pools.get(where.id);
        if (!pool) throw new Error("pool not found");
        Object.assign(pool, data);
        return { ...pool };
      },
    },
    stakedPool: {
      findMany: async ({ where, select }: any) =>
        stakes.filter(s => s.poolId === where.poolId).map(s => pick(s, select)),
      update: async ({ where, data }: any) => {
        const row = stakeFor(
          where.userWalletId_poolId.userWalletId,
          where.userWalletId_poolId.poolId
        );
        if (!row) throw new Error("stake row not found");
        Object.assign(row, data);
        return { ...row };
      },
    },
    stakeEvent: {
      createMany: async ({ data }: any) => {
        let count = 0;
        for (const e of data) {
          const dup = events.some(
            x =>
              x.transactionHash === e.transactionHash &&
              x.userWalletId === e.userWalletId &&
              x.poolId === e.poolId
          );
          if (dup) continue;
          events.push({ id: eventId++, createdAt: e.createdAt ?? new Date(), ...e });
          count++;
        }
        return { count };
      },
      findFirst: async ({ where, select }: any) => {
        const e = events.find(x => x.poolId === where.poolId && x.eventType === where.eventType);
        return e ? pick(e, select) : null;
      },
      findMany: async ({ where, select }: any) =>
        events
          .filter(x => x.poolId === where.poolId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map(e => pick(e, select)),
    },
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("INSERT IGNORE INTO staked_pools")) {
        const [userWalletId, poolId] = values as number[];
        if (!stakeFor(userWalletId, poolId)) {
          stakes.push({ id: stakeId++, userWalletId, poolId, stakeAmount: "0", updatedAt: null });
          return 1;
        }
        return 0;
      }
      throw new Error(`fake db: unexpected SQL ${sql}`);
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("FROM staked_pools") && sql.includes("FOR UPDATE")) {
        const [userWalletId, poolId] = values as number[];
        const row = stakeFor(userWalletId, poolId);
        return row ? [{ stakeAmount: row.stakeAmount }] : [];
      }
      throw new Error(`fake db: unexpected SQL ${sql}`);
    },
  };

  client.$transaction = (fn: (tx: any) => Promise<unknown>) => {
    // Snapshot so a throw rolls back, as a real transaction would
    const run = async () => {
      const snapshot = {
        pools: new Map([...pools].map(([k, v]) => [k, { ...v }])),
        stakes: stakes.map(s => ({ ...s })),
        events: events.map(e => ({ ...e })),
      };
      try {
        return await fn(client);
      } catch (error) {
        pools.clear();
        for (const [k, v] of snapshot.pools) pools.set(k, v);
        stakes.splice(0, stakes.length, ...snapshot.stakes);
        events.splice(0, events.length, ...snapshot.events);
        throw error;
      }
    };
    const result = chain.then(run, run);
    chain = result.catch(() => undefined);
    return result;
  };

  function addPool(partial: Partial<FakePool> & { id: number; walletId: number }): FakePool {
    const pool: FakePool = {
      chainId: "73863",
      name: `Pool ${partial.id}`,
      description: null,
      poolAddress: `0x${partial.id.toString(16).padStart(40, "0")}`,
      revoStaked: "0",
      fans: 0,
      hidden: false,
      creatorStakeWei: new FakeDecimal(0),
      fanStakeWei: new FakeDecimal(0),
      totalStakeWei: new FakeDecimal(0),
      activeFans: 0,
      statsUpdatedAt: null,
      createdAt: new Date("2026-10-29T00:00:00Z"),
      image_file_id: null,
      ...partial,
    };
    pools.set(pool.id, pool);
    return pool;
  }

  function addStake(userWalletId: number, poolId: number, amount: bigint) {
    stakes.push({
      id: stakeId++,
      userWalletId,
      poolId,
      stakeAmount: amount.toString(),
      updatedAt: null,
    });
  }

  function addEvent(e: Omit<FakeEvent, "id" | "createdAt"> & { createdAt?: Date }) {
    events.push({ id: eventId++, createdAt: e.createdAt ?? new Date(), ...e });
  }

  return { client, pools, stakes, events, addPool, addStake, addEvent };
}
