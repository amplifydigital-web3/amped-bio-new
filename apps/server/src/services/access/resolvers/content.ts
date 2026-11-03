import { prisma } from "@repo/database";
import { contentPublicIdSchema } from "@repo/constants";
import { servedAssetsClean } from "../../content/access";
import type { Gate, Resolver } from "../types";

/**
 * Content items (content gating spec 3.1, PR C8). Available only when the item
 * is READY, PUBLISHED, moderation CLEAR, not deleted, and every served asset
 * passed its scan; anything else answers not_found to everyone but the owner.
 * The creator's page and suspension checks stay in the engine.
 */
export const contentResolver: Resolver = {
  async get(id: string): Promise<Gate | null> {
    if (!contentPublicIdSchema.safeParse(id).success) return null;
    const item = await prisma.contentItem.findUnique({
      where: { publicId: id },
      select: {
        id: true,
        userId: true,
        accessRuleId: true,
        adult: true,
        status: true,
        publishState: true,
        moderationState: true,
        deletedAt: true,
      },
    });
    if (!item) return null;
    let available =
      item.status === "READY" &&
      item.publishState === "PUBLISHED" &&
      item.moderationState === "CLEAR" &&
      item.deletedAt === null;
    if (available) {
      const assets = await prisma.contentAsset.findMany({
        where: { contentItemId: item.id },
        select: { role: true, scanStatus: true },
      });
      available = servedAssetsClean(assets);
    }
    return {
      ownerUserId: item.userId,
      ruleId: item.accessRuleId ? Buffer.from(item.accessRuleId) : null,
      adult: item.adult,
      available,
    };
  },
};
