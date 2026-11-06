import { prisma } from "@repo/database";
import { GATABLE_BLOCK_TYPES } from "@repo/constants";
import type { Gate, Resolver } from "../types";

/**
 * Blocks (gating spec 3.6, G1 and G3). Only link, media, text and
 * telegram_group can be gated; any other block type resolves as public
 * whatever its column says. A hidden block is not on the page, so it is not
 * available to anyone but the owner.
 */
export const blockResolver: Resolver = {
  async get(id: string): Promise<Gate | null> {
    if (!/^\d{1,10}$/.test(id)) return null;
    const block = await prisma.block.findUnique({
      where: { id: Number(id) },
      select: { user_id: true, type: true, accessRuleId: true, config: true },
    });
    if (!block) return null;
    const gatable = (GATABLE_BLOCK_TYPES as readonly string[]).includes(block.type);
    const hidden = (block.config as { hidden?: unknown } | null)?.hidden === true;
    return {
      ownerUserId: block.user_id,
      ruleId: gatable && block.accessRuleId ? Buffer.from(block.accessRuleId) : null,
      adult: false,
      available: !hidden,
    };
  },
};
