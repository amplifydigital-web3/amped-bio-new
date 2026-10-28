import {
  matchReservedIn,
  seedAdminRows,
  type AdminReservedRow,
  type ReservedMatch,
} from "@repo/constants";

/**
 * Reserved handles (Build Board D2, docs/features/reserved-handles.md, 4.1).
 *
 * The system tier lives in @repo/constants. The admin tier comes from
 * `loadAdminRows`. Until the `reserved_handles` table exists (RH2), the admin
 * tier is the seed list in @repo/constants, so company and trust words such as
 * `amped` and `support` are reserved from RH1 on.
 */
async function loadAdminRows(): Promise<AdminReservedRow[]> {
  return seedAdminRows();
}

/** Matches a handle against both tiers. */
export async function matchReserved(handle: string): Promise<ReservedMatch> {
  return matchReservedIn(handle, await loadAdminRows());
}

/** The admin tier rows the generators strip prefixes from. */
export async function reservedRowsForGenerators(): Promise<AdminReservedRow[]> {
  return loadAdminRows();
}

/**
 * True when `userId` may hold the handle anyway: the word is assigned to it.
 * System words never pass.
 */
export function holderMayKeep(match: ReservedMatch, userId: number | undefined): boolean {
  if (!match.reserved || match.tier === "system") return false;
  return userId !== undefined && match.assignedUserId === userId;
}
