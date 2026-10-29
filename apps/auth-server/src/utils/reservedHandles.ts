import {
  matchReservedIn,
  seedAdminRows,
  type AdminReservedRow,
  type ReservedMatch,
} from "@repo/constants";
import { prisma } from "../services/DB";

/**
 * Reserved handles (Build Board D2, docs/features/reserved-handles.md, 4.1).
 * This process serves sign up at auth.amped.bio and has no Redis, so it reads
 * the admin tier from `reserved_handles` directly. One read serves calls for
 * up to 5 s, so a generator that tries many suffixes asks the database once,
 * and a word reserved in the admin app is refused within 5 s (acceptance 8).
 * If the read fails, the last list (or the seed list) stands in.
 */
const MAX_AGE_MS = 5_000;
let cached: { rows: AdminReservedRow[]; at: number } | null = null;

export async function loadAdminRows(): Promise<AdminReservedRow[]> {
  const now = Date.now();
  if (cached && now - cached.at < MAX_AGE_MS) return cached.rows;
  try {
    const rows = await prisma.reservedHandle.findMany({
      select: {
        id: true,
        word: true,
        kind: true,
        category: true,
        expiresAt: true,
        assignedUserId: true,
      },
    });
    cached = {
      rows: rows.map(row => ({ ...row, id: Buffer.from(row.id).toString("hex") })),
      at: now,
    };
  } catch (error) {
    console.error("[reserved-handles] admin tier load failed, keeping the last list", error);
    cached = { rows: cached?.rows ?? seedAdminRows(), at: now };
  }
  return cached.rows;
}

/** Test hook: forget the cache. */
export function resetReservedCache(): void {
  cached = null;
}

export async function matchReserved(handle: string): Promise<ReservedMatch> {
  return matchReservedIn(handle, await loadAdminRows());
}
