import { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client'

import { hashPassword, comparePasswords } from '../utils/password';
import { generateToken } from '../utils/token';
import { validateEmail } from '../utils/validation';

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
                    name, email, onelink, description, theme, image, reward_business_id
                },
            })

            const token = generateToken({ id: result.id, email: result.email });

            res.status(201).json({
                result,
                token,
            });

        } catch (error) {
            console.log('error', error);
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

            const post = await prisma.user.delete({
                where: {
                    id: Number(id),
                    email: email
                },
            })
            const token = generateToken({ id: user.id, email: user.email });

            res.json({
                post,
                token,
            });

        } catch (error) {
            console.log('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },
};