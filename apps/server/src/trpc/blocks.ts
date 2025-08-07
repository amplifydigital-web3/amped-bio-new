import { privateProcedure, router } from "./trpc";
import { z } from "zod";
import { prisma } from "../services/DB";
import { TRPCError } from "@trpc/server";
import { allowedPlatforms, mediaPlataforms } from "@ampedbio/constants";

// Define configuration schemas for each block type
const linkConfigSchema = z.object({
  platform: z.enum(allowedPlatforms),
  url: z.string().url("Must be a valid URL"),
  label: z.string().min(1, "Label is required"),
});

const mediaConfigSchema = z.object({
  platform: z.enum(mediaPlataforms),
  url: z.string().url("Must be a valid URL"),
  label: z.string(),
  content: z.string().optional(),
});

// Define allowed HTML tags
const allowedHtmlTags = ["p", "a", "span", "strong", "em", "u", "b", "i", "s"] as const;

const textConfigSchema = z.object({
  content: z
    .string()
    .min(0, "Content is required")
    .refine(
      html => {
        // Skip validation if empty
        if (!html) return true;

        // Build regex pattern from allowed tags array
        const tagPattern = allowedHtmlTags.join("|");
        const allowedTagsRegex = new RegExp(`<(?!\/?(${tagPattern})\\b)[^>]+>`, "i");

        // If the regex matches any non-allowed tags, validation fails
        return !allowedTagsRegex.test(html);
      },
      {
        message: `HTML content can only contain the following tags: ${allowedHtmlTags.map(tag => `<${tag}>`).join(", ")}`,
      }
    )
    .refine(
      html => {
        // Block JavaScript in various forms
        const jsPatterns = [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i, // <script> tags
          /javascript:/i, // javascript: protocol
          /on\w+\s*=/i, // event handlers like onclick=
          /eval\s*\(/i, // eval() calls
          /Function\s*\(/i, // Function constructor
          /\[\s*\[\s*\[\s*\[\s*\[\s*.*\]\s*\]\s*\]\s*\]\s*\]/i, // Obfuscated pattern with multiple brackets
        ];

        return !jsPatterns.some(pattern => pattern.test(html));
      },
      {
        message: "JavaScript content is not allowed in the HTML",
      }
    ),
});

// Schema for a single block
export const blockSchema = z.object({
  id: z.number(),
  type: z.string().min(1, "Block type is required"),
  order: z.number().default(0),
  // Config is validated separately based on type
  config: z.union([linkConfigSchema, mediaConfigSchema, textConfigSchema]),
});

// Schema for editing multiple blocks
export const editBlocksSchema = z.object({
  blocks: z.array(blockSchema),
});

// Schema for adding a new block - type specific validation
export const addBlockSchema = z.object({
  type: z.string().min(1, "Block type is required"),
  order: z.number().default(0),
  config: z.union([linkConfigSchema, mediaConfigSchema, textConfigSchema]),
});

// Schema for block id parameter
export const blockIdParamSchema = z.object({
  id: z.string().refine(val => !isNaN(Number(val)), {
    message: "Block ID must be a valid number",
  }),
});

export const blocksRouter = router({
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
    const { id: blockId } = input;
    const id = Number(blockId);

    try {
      const block = await prisma.block.findUnique({
        where: {
          id: id,
          user_id: userId,
        },
      });

      if (block === null) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Block not found: ${id}`,
        });
      }

      const result = await prisma.block.delete({
        where: {
          id: id,
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
