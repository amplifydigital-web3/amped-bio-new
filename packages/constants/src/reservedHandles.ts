/**
 * Reserved handles (Build Board D2, docs/features/reserved-handles.md).
 *
 * Two tiers:
 * - System tier, here in code: routes and infrastructure. No account may ever
 *   hold these, because a static route wins over /[handle] in Next.js.
 * - Admin tier: company, trust, brand, partner and hold words. They live in the
 *   database (RH2) and are managed in the admin app. `ADMIN_TIER_SEED` is the
 *   starting list; until the table exists the server matches against it.
 *
 * The admin tier is never sent to a browser. Client code may use the system
 * tier for instant feedback and must ask the server for everything else.
 */

/** Routes and infrastructure. No account may hold these, ever. Lowercase. */
export const SYSTEM_RESERVED_HANDLES: ReadonlySet<string> = new Set([
  // routes that exist
  "auth",
  "docs",
  "i",
  "login",
  "oauth",
  "og",
  "privacy",
  "register",
  "sign",
  "tg",
  // routes on the board
  "pools",
  "pool",
  "brands",
  "brand",
  "explore",
  "creators",
  "agency",
  "agencies",
  "store",
  "shop",
  "pay",
  "checkout",
  "age-check",
  "library",
  "live",
  "messages",
  // app and infrastructure
  "admin",
  "api",
  "app",
  "assets",
  "cdn",
  "dashboard",
  "editor",
  "graphql",
  "health",
  "mcp",
  "media",
  "settings",
  "static",
  "status",
  "trpc",
  "webhooks",
  "www",
  "u",
  // values that break code or read as system
  "null",
  "undefined",
  "me",
  "you",
  "new",
]);

/** Any handle that starts with one of these is a system word. */
export const SYSTEM_RESERVED_PREFIXES: readonly string[] = ["_"];

export type ReservedHandleKind = "EXACT" | "PREFIX";
export type ReservedHandleCategory = "COMPANY" | "TRUST" | "BRAND" | "PARTNER" | "HOLD";

/** One admin tier row, as the matcher needs it. */
export type AdminReservedRow = {
  id: string;
  word: string;
  kind: ReservedHandleKind;
  category: ReservedHandleCategory;
  expiresAt: Date | null;
  assignedUserId: number | null;
};

export type ReservedMatch =
  | { reserved: false }
  | { reserved: true; tier: "system" }
  | {
      reserved: true;
      tier: "admin";
      id: string;
      word: string;
      kind: ReservedHandleKind;
      category: ReservedHandleCategory;
      assignedUserId: number | null;
    };

/**
 * Starting admin tier (decision R2, R3). RH2 seeds `reserved_handles` from it.
 * A plain literal, so client bundles that never import it drop it.
 */
export const ADMIN_TIER_SEED: ReadonlyArray<{
  word: string;
  kind: ReservedHandleKind;
  category: ReservedHandleCategory;
}> = [
  { word: "amped", kind: "EXACT", category: "COMPANY" },
  { word: "ampedbio", kind: "EXACT", category: "COMPANY" },
  { word: "amped-bio", kind: "EXACT", category: "COMPANY" },
  { word: "amplify", kind: "EXACT", category: "COMPANY" },
  { word: "amplifydigital", kind: "EXACT", category: "COMPANY" },
  { word: "revo", kind: "EXACT", category: "COMPANY" },
  { word: "revolution", kind: "EXACT", category: "COMPANY" },
  { word: "oneiro", kind: "EXACT", category: "COMPANY" },
  { word: "cosimo", kind: "EXACT", category: "COMPANY" },
  { word: "official", kind: "EXACT", category: "TRUST" },
  { word: "support", kind: "EXACT", category: "TRUST" },
  { word: "help", kind: "EXACT", category: "TRUST" },
  { word: "security", kind: "EXACT", category: "TRUST" },
  { word: "safety", kind: "EXACT", category: "TRUST" },
  { word: "moderator", kind: "EXACT", category: "TRUST" },
  { word: "mod", kind: "EXACT", category: "TRUST" },
  { word: "staff", kind: "EXACT", category: "TRUST" },
  { word: "team", kind: "EXACT", category: "TRUST" },
  { word: "legal", kind: "EXACT", category: "TRUST" },
  { word: "terms", kind: "EXACT", category: "TRUST" },
  { word: "abuse", kind: "EXACT", category: "TRUST" },
  { word: "billing", kind: "EXACT", category: "TRUST" },
  { word: "contact", kind: "EXACT", category: "TRUST" },
  { word: "about", kind: "EXACT", category: "TRUST" },
  { word: "blog", kind: "EXACT", category: "TRUST" },
  { word: "press", kind: "EXACT", category: "TRUST" },
  { word: "careers", kind: "EXACT", category: "TRUST" },
  { word: "amped-", kind: "PREFIX", category: "TRUST" },
  { word: "amped_", kind: "PREFIX", category: "TRUST" },
  { word: "admin-", kind: "PREFIX", category: "TRUST" },
  { word: "support-", kind: "PREFIX", category: "TRUST" },
];

/** The seed as matcher rows, for servers that have no table to read yet. */
export function seedAdminRows(): AdminReservedRow[] {
  return ADMIN_TIER_SEED.map(row => ({
    id: `seed:${row.word}`,
    word: row.word,
    kind: row.kind,
    category: row.category,
    expiresAt: null,
    assignedUserId: null,
  }));
}

/** Lowercase, trimmed, no leading "@". Not named normalizeHandle: @repo/ui already exports one. */
export function handleKey(handle: string): string {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

/** Exact rows compare this form: separators removed, so `admin_`, `-admin-` and `ad-min` match `admin`. */
export function handleSkeleton(handle: string): string {
  return handleKey(handle).replace(/[-_]/g, "");
}

/** Prefix rows compare this form: `_` reads as `-`, so `amped_x` matches `amped-`. */
export function handlePrefixForm(handle: string): string {
  return handleKey(handle).replace(/_/g, "-");
}

const SYSTEM_SKELETONS: ReadonlySet<string> = new Set(
  [...SYSTEM_RESERVED_HANDLES].map(handleSkeleton)
);

/** Client safe check. Covers the system tier only; the server adds the admin tier. */
export function isSystemReservedHandle(handle: string): boolean {
  const key = handleKey(handle);
  if (!key) return false;
  return (
    SYSTEM_SKELETONS.has(handleSkeleton(key)) ||
    SYSTEM_RESERVED_PREFIXES.some(prefix => key.startsWith(prefix))
  );
}

function rowIsLive(row: AdminReservedRow, now: Date): boolean {
  return row.expiresAt === null || row.expiresAt.getTime() > now.getTime();
}

function rowMatches(row: AdminReservedRow, key: string): boolean {
  if (row.kind === "PREFIX") {
    return handlePrefixForm(key).startsWith(handlePrefixForm(row.word));
  }
  return handleSkeleton(key) === handleSkeleton(row.word);
}

/**
 * The one rule, shared by apps/server and apps/auth-server. System tier first,
 * then the live admin rows. A row past its `expiresAt` never matches.
 */
export function matchReservedIn(
  handle: string,
  rows: readonly AdminReservedRow[],
  now: Date = new Date()
): ReservedMatch {
  const key = handleKey(handle);
  if (!key) return { reserved: false };
  if (isSystemReservedHandle(key)) return { reserved: true, tier: "system" };
  // Exact rows win over prefix rows, so an assigned exact word is found first
  const ordered = [...rows].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "EXACT" ? -1 : 1));
  for (const row of ordered) {
    if (!rowIsLive(row, now)) continue;
    if (rowMatches(row, key)) {
      return {
        reserved: true,
        tier: "admin",
        id: row.id,
        word: row.word,
        kind: row.kind,
        category: row.category,
        assignedUserId: row.assignedUserId,
      };
    }
  }
  return { reserved: false };
}

/**
 * What a public availability check says about a reserved word (decision A5).
 * Partner and hold words answer "taken", so a guessed partner name cannot be
 * confirmed; every other reserved word answers "reserved" (decision R4).
 */
export function publicReservedReason(match: ReservedMatch): "reserved" | "taken" | null {
  if (!match.reserved) return null;
  if (match.tier === "admin" && (match.category === "PARTNER" || match.category === "HOLD")) {
    return "taken";
  }
  return "reserved";
}

/**
 * The base a generated handle starts from (section 4.6). Lowercased, cut to
 * handle characters, and stripped of a reserved prefix, so a generated or
 * renamed handle never lands under `amped-` or `_` again. Returns "user" when
 * nothing usable is left.
 */
export function generatedHandleBase(
  raw: string,
  rows: readonly AdminReservedRow[],
  options: { minLength: number; maxLength: number }
): string {
  let base = handleKey(raw).replace(/[^a-z0-9_-]/g, "");
  const prefixes = [
    ...SYSTEM_RESERVED_PREFIXES,
    ...rows.filter(row => row.kind === "PREFIX").map(row => handlePrefixForm(row.word)),
  ];
  let stripped = true;
  while (stripped && base) {
    stripped = false;
    for (const prefix of prefixes) {
      if (prefix && handlePrefixForm(base).startsWith(prefix)) {
        base = base.slice(prefix.length);
        stripped = true;
      }
    }
    base = base.replace(/^[-_]+/, "");
  }
  // Room for the numeric suffix the generators add
  base = base.slice(0, Math.max(options.minLength, options.maxLength - 14)).replace(/[-_]+$/, "");
  // A reserved base such as `support` stays: the generator checks the final
  // handle (`support4821`) and adds a suffix until it is free
  if (base.length < options.minLength) return "user";
  return base;
}
