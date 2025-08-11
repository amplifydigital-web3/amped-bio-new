import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { prisma } from "../services/DB";
import { TRPCError } from "@trpc/server";
import { addBlockSchema, blockIdParamSchema, editBlocksSchema } from "@ampedbio/constants";

export const blocksRouter = router({
  // Get all blocks for the user
  getAll: privateProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.sub;

    try {
      const result = await prisma.block.findMany({
        where: {
          user_id: userId,
        },
      });

      return { result };
    } catch (error) {
      console.error("error getting all blocks", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  // Get a specific block by ID
  get: privateProcedure.input(blockIdParamSchema).query(async ({ ctx, input }) => {
    const { id: blockId } = input;
    const id = Number(blockId);

    try {
      const result = await prisma.block.findUnique({
        where: {
          id: id,
        },
      });

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
  editBlock: privateProcedure
    .input(
      z.object({
        id: z.number(),
        type: z.string(),
        order: z.number(),
        config: z.any(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.sub;
      const { id, type, order, config } = input;

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
    const userId = ctx.user.sub;
    const { blocks } = input;

    try {
      for (let idx = 0; idx < blocks.length; idx++) {
        const { id, type, config } = blocks[idx];

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
              config: config,
            },
          });
        } else {
          await prisma.block.update({
            where: { id: id },
            data: {
              type,
              order: idx,
              config: config,
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
    const userId = ctx.user.sub;
    const { type, config } = input;

    try {
      const result = await prisma.block.create({
        data: {
          user_id: userId,
          type,
          order: 0, // Order will be updated on the client
          config,
        },
      });
      return { message: "Block added successfully", result };
    } catch (error) {
      console.error("error adding block", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Server error",
      });
    }
  }),

  deleteBlock: privateProcedure.input(blockIdParamSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.sub;

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

      const result = await prisma.block.delete({
        where: {
          id: input.id,
          user_id: userId,
        },
      });

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
});
