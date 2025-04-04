import { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client'


import { hashPassword, comparePasswords } from '../utils/password';
import { generateToken } from '../utils/token';
import { validateEmail } from '../utils/validation';

const prisma = new PrismaClient()

export const adminController = {

    // TODO: Implement admin endpoints

    // // Get all users
    // app.get('/users', async (req, res) => {
    //     const users = await prisma.user.findMany()
    //     res.json(users)
    // })

    async userList(req: Request, res: Response) {

        try {
            const users = await prisma.user.findMany();

            res.json(users);

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },

    // // Get user by ID
    // app.get('/user/:id', async (req, res) => {
    //     const { id } = req.params

    //     const user = await prisma.user
    //         .findUnique({
    //             where: {
    //                 id: Number(id),
    //             },
    //         })

    //     res.json(user)
    // })
};
