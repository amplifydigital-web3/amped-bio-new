import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { AddBlockInput, EditBlocksInput } from "../schemas/block.schema";

const prisma = new PrismaClient();

export const blockController = {
  async editBlocks(req: Request, res: Response) {
    const user_id = req.user.sub;
    const { blocks } = req.body as EditBlocksInput;

    try {
      for (let idx = 0; idx < blocks.length; idx++) {
        const { id, type, config } = blocks[idx];

        try {
          const block = await prisma.block.findUnique({
            where: {
              id: id,
              user_id: user_id,
            },
          });

          if (block === null) {
            await prisma.block.create({
              data: {
                user_id,
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
        } catch (error) {
          console.log(`error editing block ${id} `, error);
          throw error;
        }
      }

      res.status(200).json({ message: "Blocks updated successfully" });
    } catch (error) {
      console.error("error editing blocks", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  async editBlock(id: number, user_id: number, type: string, order: number, config: object) {
    const block = await prisma.block.findUnique({
      where: {
        id: id,
        user_id: user_id,
      },
    });

    if (block === null) {
      const result = await prisma.block.create({
        data: {
          user_id,
          type,
          order,
          config,
        },
      });

      return result;
    }

    const result = await prisma.block.update({
      where: { id: id },
      data: {
        type,
        order,
        config,
      },
    });

    return result;
  },

  async get(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const result = await prisma.block.findUnique({
        where: {
          id: Number(id),
        },
      });

      if (result === null) {
        return res.status(400).json({ message: `Block not found: ${id}` });
      }

      res.status(201).json({
        result,
      });
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  async getAll(req: Request, res: Response) {
    const user_id = req.user.sub;

    try {
      const result = await prisma.block.findMany({
        where: {
          user_id: user_id,
        },
      });

      res.status(201).json({
        result,
      });
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const user_id = req.user.sub;

    const numericId = Number(id);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ message: `Block id is not a number: ${id}` });
    }

    try {
      const block = await prisma.block.findUnique({
        where: {
          id: numericId,
          user_id: user_id,
        },
      });

      if (block === null) {
        return res.status(400).json({ message: `Block not found: ${id}` });
      }

      const result = await prisma.block.delete({
        where: {
          id: numericId,
          user_id: user_id,
        },
      });

      res.json({
        result,
      });
    } catch (error) {
      console.error("error", error);
      res.status(500).json({ message: "Server error" });
    }
  },

  async addBlock(req: Request, res: Response) {
    const user_id = req.user.sub;

    try {
      const { type, order, config } = req.body as AddBlockInput;

      const result = await prisma.block.create({
        data: {
          user_id,
          type,
          order: order || 0,
          config,
        },
      });

      res.status(201).json({
        message: "Block added successfully",
        result,
      });
    } catch (error) {
      console.error("error adding block", error);
      res.status(500).json({ message: "Server error" });
    }
  },
};
