/**
 * Content blocks keep only the creator's own items (spec 3.7: "Saves confirm
 * every id belongs to the block owner"). Ids of someone else's items, or of
 * items that no longer exist, are dropped on save, in order. Whether an owned
 * item may show is still decided at render (drafts, 18+ and deleted items skip).
 */
import { prisma } from "@repo/database";
import type { ContentBlockConfig } from "@repo/constants";

export async function keepOwnedContentIds<T>(userId: number, type: string, config: T): Promise<T> {
  if (type !== "content" || !config || typeof config !== "object") return config;
  const ids = (config as unknown as ContentBlockConfig).publicIds ?? [];
  if (!ids.length) return config;
  const owned = await prisma.contentItem.findMany({
    where: { userId, publicId: { in: ids }, status: { not: "DELETED" } },
    select: { publicId: true },
  });
  const ownedIds = new Set(owned.map(item => item.publicId));
  return { ...config, publicIds: ids.filter(id => ownedIds.has(id)) } as T;
}
