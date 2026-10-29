/**
 * Pool list paging (Build Board D7, PL2). Spec: docs/features/pools-list-paging.md section 4.
 *
 * Pure pieces of pools.list.listPools: the cursor, the search term, and the
 * SQL for one page. Kept apart from the router so they are tested without a
 * database.
 */
import { Prisma } from "@repo/database";

export const POOL_LIST_SORTS = [
  "newest",
  "name-asc",
  "name-desc",
  "most-fans",
  "most-staked",
] as const;
export const POOL_LIST_FILTERS = [
  "all",
  "no-fans",
  "more-than-10-fans",
  "more-than-10k-stake",
] as const;
export type PoolListSort = (typeof POOL_LIST_SORTS)[number];
export type PoolListFilter = (typeof POOL_LIST_FILTERS)[number];

/** 10,000 tREVO in wei, the more-than-10k-stake threshold (as getPools). */
export const TEN_K_STAKE_WEI = (10_000n * 10n ** 18n).toString();
/** InnoDB's default innodb_ft_min_token_size. Shorter terms skip the description. */
export const FULLTEXT_MIN_LENGTH = 3;

export interface PoolListCursor {
  sort: PoolListSort;
  /** Search tier; 0 when there is no search. */
  tier: number;
  /** The sort value of the last row: wei as text, a fan count, or a name. null for newest. */
  value: string | number | null;
  id: number;
}

export function encodeCursor(cursor: PoolListCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.sort, cursor.tier, cursor.value, cursor.id]),
    "utf8"
  ).toString("base64url");
}

/** Decodes a cursor for `sort`. Returns null when it is malformed or names another sort. */
export function decodeCursor(raw: string, sort: PoolListSort): PoolListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 4) return null;
    const [s, tier, value, id] = parsed;
    if (s !== sort) return null;
    if (!Number.isInteger(tier) || tier < 0 || tier > 3) return null;
    if (!Number.isInteger(id) || id < 1) return null;
    if (sort === "newest" && value !== null) return null;
    if ((sort === "name-asc" || sort === "name-desc") && typeof value !== "string") return null;
    if (sort === "most-fans" && !Number.isInteger(value)) return null;
    if (sort === "most-staked" && !(typeof value === "string" && /^\d{1,78}$/.test(value)))
      return null;
    return { sort, tier, value, id };
  } catch {
    return null;
  }
}

export interface SearchTerm {
  kind: "none" | "address" | "text";
  /** The text as typed, trimmed */
  text: string;
  /** The handle form: leading @ removed, lower case */
  handle: string;
  /** Boolean mode FULLTEXT query, or null when the term is too short */
  fulltext: string | null;
}

/** Escapes LIKE wildcards so a typed % or _ matches itself. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}

export function parseSearch(search: string | undefined): SearchTerm {
  const text = (search ?? "").trim();
  if (!text) return { kind: "none", text: "", handle: "", fulltext: null };
  if (/^0x[a-fA-F0-9]{40}$/.test(text)) {
    return { kind: "address", text: text.toLowerCase(), handle: "", fulltext: null };
  }
  const handle = text.replace(/^@+/, "").toLowerCase();
  // Boolean mode operators are stripped; every remaining word is a prefix match
  const words = text
    .replace(/[+\-<>()~*"@]/g, " ")
    .split(/\s+/)
    .filter(word => word.length >= FULLTEXT_MIN_LENGTH);
  const fulltext = words.length ? words.map(word => `${word}*`).join(" ") : null;
  return { kind: "text", text, handle, fulltext };
}

const NAME_KEY = Prisma.sql`COALESCE(cp.name, CONCAT('Pool ', cp.id))`;

/** The search tier of a row (decision P5). 0 without a text search. */
function tierSql(term: SearchTerm): Prisma.Sql {
  if (term.kind !== "text") return Prisma.sql`0`;
  const prefix = `${escapeLike(term.text)}%`;
  const contains = `%${escapeLike(term.text)}%`;
  const handlePrefix = `${escapeLike(term.handle)}%`;
  const handleContains = `%${escapeLike(term.handle)}%`;
  return Prisma.sql`CASE
    WHEN cp.name LIKE ${prefix} OR u.littlelink_name LIKE ${handlePrefix} THEN 1
    WHEN cp.name LIKE ${contains} OR u.littlelink_name LIKE ${handleContains} OR u.name LIKE ${contains} THEN 2
    ELSE 3 END`;
}

function whereSql(chainId: string, filter: PoolListFilter, term: SearchTerm): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`cp.chainId = ${chainId}`,
    Prisma.sql`cp.hidden = false`,
    Prisma.sql`cp.poolAddress IS NOT NULL`,
    // A suspended creator's pool never appears (suspended-pages spec)
    Prisma.sql`u.block = 'no'`,
  ];
  if (filter === "no-fans") parts.push(Prisma.sql`cp.active_fans = 0`);
  if (filter === "more-than-10-fans") parts.push(Prisma.sql`cp.active_fans > 10`);
  if (filter === "more-than-10k-stake")
    parts.push(Prisma.sql`cp.total_stake_wei > CAST(${TEN_K_STAKE_WEI} AS DECIMAL(65,0))`);

  if (term.kind === "address") parts.push(Prisma.sql`cp.poolAddress = ${term.text}`);
  if (term.kind === "text") {
    const contains = `%${escapeLike(term.text)}%`;
    const handleContains = `%${escapeLike(term.handle)}%`;
    const matches: Prisma.Sql[] = [
      Prisma.sql`cp.name LIKE ${contains}`,
      Prisma.sql`u.littlelink_name LIKE ${handleContains}`,
      Prisma.sql`u.name LIKE ${contains}`,
    ];
    // Decision P2: the description, through the FULLTEXT index, ranked last
    if (term.fulltext)
      matches.push(Prisma.sql`MATCH (cp.description) AGAINST (${term.fulltext} IN BOOLEAN MODE)`);
    parts.push(Prisma.sql`(${Prisma.join(matches, " OR ")})`);
  }
  return Prisma.join(parts, " AND ");
}

interface SortSpec {
  key: Prisma.Sql | null;
  dir: "ASC" | "DESC";
  /** Cast for the cursor value so the comparison keeps full precision */
  cast: (value: string | number) => Prisma.Sql;
}

function sortSpec(sort: PoolListSort): SortSpec {
  switch (sort) {
    case "name-asc":
      return { key: NAME_KEY, dir: "ASC", cast: v => Prisma.sql`${String(v)}` };
    case "name-desc":
      return { key: NAME_KEY, dir: "DESC", cast: v => Prisma.sql`${String(v)}` };
    case "most-fans":
      return { key: Prisma.sql`cp.active_fans`, dir: "DESC", cast: v => Prisma.sql`${Number(v)}` };
    case "most-staked":
      return {
        key: Prisma.sql`cp.total_stake_wei`,
        dir: "DESC",
        cast: v => Prisma.sql`CAST(${String(v)} AS DECIMAL(65,0))`,
      };
    case "newest":
    default:
      return { key: null, dir: "DESC", cast: v => Prisma.sql`${v}` };
  }
}

export interface PageQueryInput {
  chainId: string;
  filter: PoolListFilter;
  sort: PoolListSort;
  limit: number;
  term: SearchTerm;
  cursor: PoolListCursor | null;
}

const FROM = Prisma.sql`FROM creator_pools cp
  JOIN user_wallets uw ON uw.id = cp.walletId
  JOIN users u ON u.id = uw.userId
  LEFT JOIN uploaded_files f ON f.id = cp.image_file_id`;

/**
 * One page, keyset ordered: tier (searches only), the sort key, then id.
 * Fetches limit + 1 rows so the caller knows whether a next page exists.
 */
export function pageQuery(input: PageQueryInput): Prisma.Sql {
  const { term, cursor } = input;
  const spec = sortSpec(input.sort);
  const searching = term.kind === "text";
  const tier = tierSql(term);
  const idDir = input.sort === "name-asc" ? "ASC" : "DESC";
  const op = (dir: "ASC" | "DESC") => (dir === "ASC" ? Prisma.sql`>` : Prisma.sql`<`);

  const order: Prisma.Sql[] = [];
  if (searching) order.push(Prisma.sql`tier ASC`);
  if (spec.key) order.push(Prisma.sql`${spec.key} ${Prisma.raw(spec.dir)}`);
  order.push(Prisma.sql`cp.id ${Prisma.raw(idDir)}`);

  let after = Prisma.empty;
  if (cursor) {
    const idCmp = Prisma.sql`cp.id ${op(idDir)} ${cursor.id}`;
    const withinTier = spec.key
      ? Prisma.sql`(${spec.key} ${op(spec.dir)} ${spec.cast(cursor.value ?? "")} OR (${spec.key} = ${spec.cast(cursor.value ?? "")} AND ${idCmp}))`
      : idCmp;
    after = searching
      ? Prisma.sql`AND ((${tier}) > ${cursor.tier} OR ((${tier}) = ${cursor.tier} AND ${withinTier}))`
      : Prisma.sql`AND ${withinTier}`;
  }

  return Prisma.sql`SELECT cp.id, cp.name, cp.description, cp.chainId, cp.poolAddress,
      cp.image_file_id AS imageFileId, f.s3_key AS s3Key,
      CAST(cp.total_stake_wei AS CHAR) AS totalStakeWei, cp.active_fans AS activeFans,
      ${NAME_KEY} AS nameKey, ${tier} AS tier
    ${FROM}
    WHERE ${whereSql(input.chainId, input.filter, term)} ${after}
    ORDER BY ${Prisma.join(order, ", ")}
    LIMIT ${input.limit + 1}`;
}

export function countQuery(chainId: string, filter: PoolListFilter, term: SearchTerm): Prisma.Sql {
  return Prisma.sql`SELECT COUNT(*) AS total ${FROM} WHERE ${whereSql(chainId, filter, term)}`;
}

/** Every listed pool on a chain, for the sitemap. No chain reads. */
export function sitemapQuery(chainId: string): Prisma.Sql {
  return Prisma.sql`SELECT cp.poolAddress AS address,
      COALESCE(cp.stats_updated_at, cp.created_at) AS updatedAt
    ${FROM}
    WHERE ${whereSql(chainId, "all", { kind: "none", text: "", handle: "", fulltext: null })}
    ORDER BY cp.id ASC`;
}

export interface PageRow {
  id: number;
  name: string | null;
  description: string | null;
  chainId: string;
  poolAddress: string;
  imageFileId: number | null;
  s3Key: string | null;
  totalStakeWei: string;
  activeFans: number | bigint;
  nameKey: string;
  tier: number | bigint;
}

/** The cursor that continues after `row`. */
export function cursorAfter(row: PageRow, sort: PoolListSort): PoolListCursor {
  const value =
    sort === "name-asc" || sort === "name-desc"
      ? row.nameKey
      : sort === "most-fans"
        ? Number(row.activeFans)
        : sort === "most-staked"
          ? row.totalStakeWei.split(".")[0]
          : null;
  return { sort, tier: Number(row.tier), value, id: Number(row.id) };
}
