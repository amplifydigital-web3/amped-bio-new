import {
  matchReservedIn,
  seedAdminRows,
  type AdminReservedRow,
  type ReservedMatch,
} from "@repo/constants";

/**
 * Reserved handles (Build Board D2, docs/features/reserved-handles.md, 4.1).
 * This process serves sign up at auth.amped.bio and has no Redis, so it reads
 * the admin tier directly. Until the `reserved_handles` table exists (RH2),
 * the admin tier is the seed list in @repo/constants.
 */
export async function loadAdminRows(): Promise<AdminReservedRow[]> {
  return seedAdminRows();
}

export async function matchReserved(handle: string): Promise<ReservedMatch> {
  return matchReservedIn(handle, await loadAdminRows());
}
