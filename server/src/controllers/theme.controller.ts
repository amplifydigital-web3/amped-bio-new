import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client'


const prisma = new PrismaClient()

export const themeController = {
    // edit theme for user
    async editTheme(req: Request, res: Response) {
        const { id } = req.params
        const { user_id, theme } = req.body.data;
        const { name, share_level, share_config, config } = theme;

        try {
            const theme = await prisma.theme.findUnique({
                where: {
                    id: Number(id),
                    user_id: Number(user_id)
                }
            });

            if (theme === null || Number(id) === 0) {
                const result = await prisma.theme.create({
                    data: {
                        user_id, name, share_level, share_config, config
                    },
                })


                return res.status(201).json({
                    result
                });

            }

            const result = await prisma.theme.update({
                where: { id: Number(id) },
                data: {
                    name, share_level, share_config, config
                },
            })


            res.status(201).json({
                result
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },

    // get theme by id
    async get(req: Request, res: Response) {
        const { id } = req.params

        // TODO filter requests if theme is not visible to current user. Check theme share_level, share_config and user id
        try {
            const result = await prisma.theme.findUnique({
                where: {
                    id: Number(id),
                }
            });

            if (result === null) {
                return res.status(400).json({ message: `Theme not found: ${id}` });
            }

            res.status(201).json({
                result,
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },

    // delete theme by id
    async delete(req: Request, res: Response) {
        const { user_id, id } = req.body.data;

        // TODO filter requests if theme is not editiable by user
        try {
            const theme = await prisma.theme.findUnique({
                where: {
                    id: Number(id),
                    user_id: user_id
                }
            });

            if (theme === null) {
                return res.status(400).json({ message: `Theme not found: ${id}` });
            }

            const result = await prisma.theme.delete({
                where: {
                    id: Number(id),
                    user_id: user_id
                },
            })

            res.json({
                result,
            });

        } catch (error) {
            console.error('error', error);
            res.status(500).json({ message: 'Server error' });
        }
    },

    // TODO add a getAll themes for planned Gallery feature
    // return all themes based on share_level and share_config
};