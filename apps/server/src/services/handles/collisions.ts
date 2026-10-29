import { handlePrefixForm, handleSkeleton, type ReservedHandleKind } from "@repo/constants";
import { Prisma, prisma } from "@repo/database";
import type { Tx } from "../adminAudit";

/** A prefix that matches more accounts than this is refused as too broad (spec 7.3) */
export const PREFIX_MAX_ACCOUNTS = 200;
/** The sheet lists this many accounts; the rest take the Action for all */
export const COLLISIONS_LISTED = 20;

type Db = Tx | typeof prisma;

/**
 * The accounts whose handle matches `word`, by the same folded forms as the
 * matcher (spec section 5): an exact word compares the skeleton (no `-` or
 * `_`), a prefix compares the prefix form (`_` read as `-`). The prefix form
 * holds only a to z, 0 to 9 and `-`, so the LIKE pattern has no wildcard in
 * it; it is escaped anyway. Ordered by account id, so the first 20 are stable
 * between Continue and Save.
 */
export async function collidingUserIds(
  db: Db,
  word: string,
  kind: ReservedHandleKind,
  limit?: number
): Promise<number[]> {
  const take = limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`;
  let rows: { id: number }[];
  if (kind === "EXACT") {
    const skeleton = handleSkeleton(word);
    rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM users
      WHERE littlelink_name IS NOT NULL
        AND REPLACE(REPLACE(LOWER(littlelink_name), '-', ''), '_', '') = ${skeleton}
      ORDER BY id ${take}`;
  } else {
    const pattern = `${handlePrefixForm(word).replace(/[\\%_]/g, char => `\\${char}`)}%`;
    rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM users
      WHERE littlelink_name IS NOT NULL
        AND REPLACE(LOWER(littlelink_name), '_', '-') LIKE ${pattern}
      ORDER BY id ${take}`;
  }
  return rows.map(row => Number(row.id));
}

export async function countColliding(
  db: Db,
  word: string,
  kind: ReservedHandleKind
): Promise<number> {
  // Counting past the guard tells the admin nothing more
  const ids = await collidingUserIds(db, word, kind, PREFIX_MAX_ACCOUNTS + 1);
  return ids.length;
}

export type CollisionAccount = {
  id: number;
  handle: string;
  name: string;
  pageStatus: "PUBLISHED" | "UNPUBLISHED";
  followers: number;
  hasPool: boolean;
  lastSignInAt: Date | null;
};

/** Account details the collision list shows: page status, followers, pool, last sign in */
export async function describeAccounts(db: Db, ids: number[]): Promise<CollisionAccount[]> {
  if (ids.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      handle: true,
      name: true,
      page_status: true,
      _count: { select: { followsReceived: true } },
      wallet: { select: { _count: { select: { creatorPools: true } } } },
      sessions: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const byId = new Map(users.map(user => [user.id, user]));
  return ids.flatMap(id => {
    const user = byId.get(id);
    if (!user || !user.handle) return [];
    return [
      {
        id: user.id,
        handle: user.handle,
        name: user.name,
        pageStatus: user.page_status,
        followers: user._count.followsReceived,
        hasPool: (user.wallet?._count.creatorPools ?? 0) > 0,
        lastSignInAt: user.sessions[0]?.createdAt ?? null,
      },
    ];
  });
}
