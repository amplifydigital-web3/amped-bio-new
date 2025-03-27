import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client'

import { generateToken } from '../utils/token';

const prisma = new PrismaClient()

export const userController = {
    async edit(req: Request, res: Response) {
        const { id } = req.params
        const { name, email, onelink, description, theme, image, reward_business_id } = req.body.data;

        try {
            const user = await prisma.user.findUnique({
                where: {
                    email: email
                }
            });

            if (user === null) {
                return res.status(400).json({ message: `User not found: ${email}` });
            }

            const result = await prisma.user.update({
                where: { id: Number(id) },
                data: {
                    name, email, onelink, description, theme: `${theme}`, image, reward_business_id
                },
            })

            const token = generateToken({ id: result.id, email: result.email });

            res.status(201).json({
                result,
                token,
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },

    async get(req: Request, res: Response) {
        const { id } = req.params

        try {
            const user = await prisma.user.findUnique({
                where: {
                    id: Number(id),
                }
            });

            if (user === null) {
                return res.status(400).json({ message: `User not found: ${id}` });
            }

            const { theme: theme_id } = user;

            const theme = await prisma.theme.findUnique({
                where: {
                    id: Number(theme_id)
                }
            });

            const blocks = await prisma.block.findMany({
                where: {
                    user_id: Number(id)
                }
            });

            const token = generateToken({ id: user.id, email: user.email });

            const result = { user, theme, blocks };

            res.status(201).json({
                result,
                token,
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },

    async delete(req: Request, res: Response) {
        const { email, id } = req.body.data;

        try {
            const user = await prisma.user.findUnique({
                where: {
                    email: email
                }
            });

            if (user === null) {
                return res.status(400).json({ message: `User not found: ${email}` });
            }

            const result = await prisma.user.delete({
                where: {
                    id: Number(id),
                    email: email
                },
            })
            const token = generateToken({ id: user.id, email: user.email });

            res.json({
                result,
                token,
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },
};