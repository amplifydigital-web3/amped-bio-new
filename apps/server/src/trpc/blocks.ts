import { privateProcedure, publicProcedure, router } from "./trpc";
import { prisma } from "@repo/database";
import { TRPCError } from "@trpc/server";
import {
  SINGLETON_BLOCK_TYPES,
  addBlockSchema,
  blockIdParamSchema,
  blockSchema,
  blockSetAccessSchema,
  editBlocksSchema,
} from "@repo/constants";
import { sanitizeBlockConfig } from "../utils/sanitizeBlockConfig";
import { keepOwnedContentIds } from "../services/content/blockConfig";
import {
  ACCESS_WRITE_MESSAGES,
  cleanupInlineRule,
  forgetRules,
  ownerAccess,
  ownerPoolId,
  resolveAccessInput,
  stakeKindsAllowed,
} from "../services/access";
import { isLockable } from "../services/access/blocks";
import { isFeatureOn } from "../services/featureFlags";

const ruleHex = (id: Uint8Array) => Buffer.from(id).toString("hex");

/** The owner's rows without the raw rule id: the editor reads `gated`, not bytes. */
function ownerBlock<T extends { accessRuleId?: Uint8Array | null }>(row: T) {
  const { accessRuleId, ...rest } = row;
  return { ...rest, gated: Boolean(accessRuleId) };
}

export const blocksRouter = router({
  // Get all blocks for the user
  getAll: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user!.sub;

    try {
      const rows = await prisma.block.findMany({
        where: {
          user_id: userId,
        },
      });

      return { result: rows.map(ownerBlock) };
    } catch (error) {
      console.error("error getting all blocks", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Get a specific block by ID
  // G3: owner only. Any signed in account could read any block's URL before,
  // which would have exposed a gated link.
  get: privateProcedure.input(blockIdParamSchema).query(async ({ ctx, input }) => {
    const { id: blockId } = input;
    const id = Number(blockId);

    try {
      const row = await prisma.block.findUnique({
        where: {
          id: id,
        },
      });
      const result = row && row.user_id === ctx.user!.sub ? ownerBlock(row) : null;

      if (result === null) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Block not found: ${id}`,
        });
      }

      return { result };
    } catch (error) {
      console.error("error getting block", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Edit a single block
  // D57: the config is checked with its type's schema, like editBlocks and
  // addBlock. It used to take any config, so a link could store javascript:.
  editBlock: privateProcedure.input(blockSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    const { id, type, order } = input;
    const config = await keepOwnedContentIds(userId, type, sanitizeBlockConfig(type, input.config));

    try {
      const block = await prisma.block.findUnique({
        where: {
          id: id,
          user_id: userId,
        },
      });

      if (block === null) {
        const result = await prisma.block.create({
          data: {
            user_id: userId,
            type,
            order,
            config,
          },
        });

        return { result };
      }

      const result = await prisma.block.update({
        where: { id: id },
        data: {
          type,
          order,
          config,
        },
      });

      return { result };
    } catch (error) {
      console.error(`error editing block ${id}`, error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  editBlocks: privateProcedure.input(editBlocksSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    const { blocks } = input;

    try {
      for (let idx = 0; idx < blocks.length; idx++) {
        const { id, type } = blocks[idx];
        const config = await keepOwnedContentIds(
          userId,
          type,
          sanitizeBlockConfig(type, blocks[idx].config)
        );

        const block = await prisma.block.findUnique({
          where: {
            id: id,
            user_id: userId,
          },
        });

        if (block === null) {
          await prisma.block.create({
            data: {
              user_id: userId,
              type,
              order: idx,
              config: config as any,
            },
          });
        } else {
          await prisma.block.update({
            where: { id: id },
            data: {
              type,
              order: idx,
              config: config as any,
            },
          });
        }
      }
      return { message: "Blocks updated successfully" };
    } catch (error) {
      console.error("error editing blocks", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  addBlock: privateProcedure.input(addBlockSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    const { type } = input;
    const config = await keepOwnedContentIds(userId, type, sanitizeBlockConfig(type, input.config));

    try {
      const result = await prisma.$transaction(async tx => {
        // Referral, Follow button and Followers are one per page (#30 decision 3)
        if ((SINGLETON_BLOCK_TYPES as readonly string[]).includes(type)) {
          const existing = await tx.block.findFirst({
            where: {
              user_id: userId,
              type,
            },
          });

          if (existing) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                type === "referral"
                  ? "You can only have one Referral Link block per profile"
                  : "This block is already on your page",
            });
          }
        }

        return await tx.block.create({
          data: {
            user_id: userId,
            type,
            order: 0,
            config: config as any,
          },
        });
      });
      return { message: "Block added successfully", result };
    } catch (error) {
      console.error("error adding block", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  deleteBlock: privateProcedure.input(blockIdParamSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;

    try {
      const block = await prisma.block.findUnique({
        where: {
          id: input.id,
          user_id: userId,
        },
      });

      if (block === null) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Block not found: ${input.id}`,
        });
      }

      // The block goes first, then its inline rule if nothing else uses it (G3, AD2 order)
      const { result, deleted } = await prisma.$transaction(async tx => {
        const result = await tx.block.delete({
          where: {
            id: input.id,
            user_id: userId,
          },
        });
        const deleted = block.accessRuleId
          ? await cleanupInlineRule(tx, ruleHex(block.accessRuleId))
          : [];
        return { result: ownerBlock(result), deleted };
      });
      await forgetRules(deleted);

      return { result };
    } catch (error) {
      console.error("error deleting block", error);
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  /** The block's rule for the row's picker (G3). Owner only, with their own params. */
  getAccess: privateProcedure.input(blockIdParamSchema).query(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    const block = await prisma.block.findUnique({ where: { id: input.id } });
    if (!block || block.user_id !== userId) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Block not found: ${input.id}` });
    }
    if (!isFeatureOn("accessGating")) return { access: null, gating: null };
    return {
      access: await ownerAccess(block.accessRuleId),
      gating: {
        stakeKindsAllowed: await stakeKindsAllowed(userId),
        poolId: await ownerPoolId(userId),
      },
    };
  }),

  /**
   * Attach, change or clear the rule on a link, media or text block (G3). The
   * same refusals as content.update: flag off, stake kinds outside the pilot
   * allowlist, kinds not live, another creator's rule. The old inline rule is
   * cleaned up in the same transaction.
   */
  setAccessRule: privateProcedure.input(blockSetAccessSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user!.sub;
    if (!isFeatureOn("accessGating")) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: ACCESS_WRITE_MESSAGES.gatingOff,
      });
    }
    const block = await prisma.block.findUnique({ where: { id: input.blockId } });
    if (!block || block.user_id !== userId) {
      throw new TRPCError({ code: "NOT_FOUND", message: `Block not found: ${input.blockId}` });
    }
    if (input.access !== null && !isLockable(block.type)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This block can not be locked." });
    }
    const access = input.access;
    const { deleted, gated } = await prisma.$transaction(async tx => {
      const ruleId = access === null ? null : await resolveAccessInput(tx, userId, access);
      await tx.block.update({ where: { id: block.id }, data: { accessRuleId: ruleId } });
      const previous = block.accessRuleId ? Buffer.from(block.accessRuleId) : null;
      const deleted =
        previous && !(ruleId && previous.equals(ruleId))
          ? await cleanupInlineRule(tx, ruleHex(previous))
          : [];
      return { deleted, gated: ruleId !== null };
    });
    await forgetRules(deleted);
    return { gated };
  }),

  registerClick: publicProcedure.input(blockIdParamSchema).mutation(async ({ ctx, input }) => {
    const { id } = input;

    try {
      // A signed in creator clicking their own block (editor preview or their own
      // public page) is not a visitor click. updateMany with a user_id filter skips
      // the increment in that case without an extra query.
      const viewerId = ctx.user?.sub;
      await prisma.block.updateMany({
        where: {
          id: id,
          ...(viewerId ? { user_id: { not: viewerId } } : {}),
        },
        data: {
          clicks: {
            increment: 1,
          },
        },
      });

      return true;
    } catch (error) {
      console.error(`error registering click for block ${id}`, error);
      return false;
    }
  }),
});
