/**
 * Performer release check (docs/features/store-policy.md 4.2, content gating 3.5,
 * adult content review 5.3, R4). Placing an item with people who appear on a
 * surface (store, memberships, paid messages, Broadcast, live) must be allowed by
 * every tagged person's release. Items with nobody tagged, and the item itself
 * ("content"), are always allowed.
 */
import { surfaceAllowed } from "../safety/adultSetup";

export type ReleaseSurface =
  | "content"
  | "store"
  | "memberships"
  | "paid_messages"
  | "broadcast"
  | "live";

export async function releaseAllowsSurface(
  item: { id: Uint8Array; adult: boolean },
  surface: ReleaseSurface
): Promise<boolean> {
  return surfaceAllowed(item.id, surface);
}
