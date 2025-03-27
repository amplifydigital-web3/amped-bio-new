import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client'


const prisma = new PrismaClient()

export const onelinkController = {
    async getOnelink(req: Request, res: Response) {
        const { onelink } = req.params

        try {
            const user = await prisma.user.findUnique({
                where: {
                    onelink: onelink,
                }
            });

            if (user === null) {
                return res.status(400).json({ message: `Onelink not found: ${onelink}` });
            }

            const { theme: theme_id, id: user_id, name, email, description, image } = user;

            const theme = await prisma.theme.findUnique({
                where: {
                    id: Number(theme_id)
                }
            });

            const blocks = await prisma.block.findMany({
                where: {
                    user_id: Number(user_id)
                }
            });

            const result = { user: { name, email, description, image }, theme, blocks };

            res.status(201).json({
                result,
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },
    async checkOnelink(req: Request, res: Response) {
        const { onelink } = req.params

        try {
            const user = await prisma.user.findUnique({
                where: {
                    onelink: onelink,
                }
            });

            if (user === null) {
                return res.status(201).json({ url: onelink, message: 'Available' });
            } else {
                return res.status(201).json({ url: onelink, message: 'Taken' });
            }

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },
};