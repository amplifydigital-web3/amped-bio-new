/**
 * Performer release check (docs/features/store-policy.md 4.2, content gating
 * 3.5). Placing an 18+ item with people who appear on a surface (store,
 * memberships, paid messages, Broadcast, live) must be allowed by every
 * person's release. The check is built in R4; until then rule writing calls this
 * hook, which allows every surface.
 */
export type ReleaseSurface =
  | "content"
  | "store"
  | "memberships"
  | "paid_messages"
  | "broadcast"
  | "live";

export async function releaseAllowsSurface(
  _item: { id: Uint8Array; adult: boolean },
  _surface: ReleaseSurface
): Promise<boolean> {
  return true;
}
