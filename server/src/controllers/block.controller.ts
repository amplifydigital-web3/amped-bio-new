import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client'


type BlockRaw = {
    id: number,
    type: string,
    platform?: string,
    url?: string,
    label?: string,
    content?: string
}

const prisma = new PrismaClient()

export const blockController = {
    async editBlocks(req: Request, res: Response) {
        const { user_id } = req.params;
        const { blocks } = req.body.data;
        try {
            await blocks.forEach((block: BlockRaw, idx: number) => {
                const { id: id_raw, type, ...rest } = block;
                let id = Number(id_raw);
                if (Number.isNaN(id)) {
                    id = 0;
                }
                try {
                    blockController.editBlock(Number(id), Number(user_id), type, idx, rest);
                }
                catch (error) {
                    console.log(`error editing block ${id} `, error);
                    throw (error);
                }
            });

            res.status(201).json({ message: 'Blocks updated successfully' });
        }
        catch (error) {
            console.error('error editing blocks', error);
            res.status(500).json({ message: 'Server error' });
        }
    },

    async editBlock(id: number, user_id: number, type: string, order: number, config: object) {
        // console.log('editing block', { user_id, id, type, order, config });
        const block = await prisma.block.findUnique({
            where: {
                id: id,
                user_id: user_id
            }
        });

        if (block === null) {
            const result = await prisma.block.create({
                data: {
                    user_id, type, order, config
                },
            })

            return result;
        }

        const result = await prisma.block.update({
            where: { id: id },
            data: {
                type, order, config
            },
        })

        return result;


    },

    async get(req: Request, res: Response) {
        const { id } = req.params

        try {
            const result = await prisma.block.findUnique({
                where: {
                    id: Number(id),
                }
            });

            if (result === null) {
                return res.status(400).json({ message: `Block not found: ${id}` });
            }

            res.status(201).json({
                result
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },

    async getAll(req: Request, res: Response) {
        const { user_id } = req.params

        try {
            const result = await prisma.block.findMany({
                where: {
                    user_id: Number(user_id),
                }
            });

            if (result === null) {
                return res.status(400).json({ message: `Blocks not found for user: ${user_id}` });
            }

            res.status(201).json({
                result
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },

    async delete(req: Request, res: Response) {
        const { id: id_combined } = req.params
        const [id_raw, user_id] = id_combined.split('$');
        let id = Number(id_raw);
        if (Number.isNaN(id)) {
            id = 0;
        }

        try {
            const user = await prisma.block.findUnique({
                where: {
                    id: Number(id),
                    user_id: Number(user_id)
                }
            });

            if (user === null) {
                return res.status(400).json({ message: `Block not found: ${id}` });
            }

            const result = await prisma.block.delete({
                where: {
                    id: Number(id),
                    user_id: Number(user_id)
                },
            })

            res.json({
                result
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },
};