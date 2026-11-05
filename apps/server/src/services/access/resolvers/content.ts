import { prisma } from "@repo/database";
import { contentPublicIdSchema } from "@repo/constants";
import { ownerCanOpen, servedAssetsClean } from "../../content/access";
import { adultOpen } from "../../content/adult";
import type { Gate, Resolver } from "../types";

/**
 * Content items (content gating spec 3.1, PR C8). Available only when the item
 * is READY, PUBLISHED, moderation CLEAR, not deleted, and every served asset
 * passed its scan; anything else answers not_found to everyone but the owner.
 * The owner opens it only while ownerCanOpen holds (READY, not moderation
 * BLOCKED) and its served assets are clean, as loadItemForViewer did.
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
    // The owner opens what ownerCanOpen allows: READY and not moderation BLOCKED
    let ownerOpens = ownerCanOpen(item);
    let available =
      ownerOpens &&
      item.publishState === "PUBLISHED" &&
      item.moderationState === "CLEAR" &&
      item.deletedAt === null &&
      // 18+ is unavailable to everyone but the owner while the adultContent flag
      // is off (identity checks 4.4). When on, the engine's age step decides.
      (!item.adult || adultOpen());
    if (ownerOpens) {
      const assets = await prisma.contentAsset.findMany({
        where: { contentItemId: item.id },
        select: { role: true, scanStatus: true },
      });
      const clean = servedAssetsClean(assets);
      ownerOpens = clean;
      available = available && clean;
    }
    return {
      ownerUserId: item.userId,
      ruleId: item.accessRuleId ? Buffer.from(item.accessRuleId) : null,
      adult: item.adult,
      available,
      ownerCanOpen: ownerOpens,
    };
  },
};
