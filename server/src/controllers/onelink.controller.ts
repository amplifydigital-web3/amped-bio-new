import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const onelinkController = {
  async getOnelink(req: Request, res: Response) {
    console.group('🔗 GET ONELINK REQUEST');
    console.info('📥 Received request for onelink');
    const { onelink } = req.params;
    console.info(`🔍 Looking up onelink: ${onelink}`);

    try {
      console.info('🔄 Querying database for user');
      const user = await prisma.user.findUnique({
        where: {
          onelink: onelink,
        },
      });
      console.info(`🔍 User lookup result: ${user ? '✅ Found' : '❌ Not found'}`);

      if (user === null) {
        console.info(`⚠️ Onelink not found: ${onelink}`);
        console.groupEnd();
        return res.status(400).json({ message: `Onelink not found: ${onelink}` });
      }

      const { theme: theme_id, id: user_id, name, email, description, image } = user;
      console.info(`👤 User data extracted - Name: ${name}, ID: ${user_id}, Theme ID: ${theme_id}`);

      console.info(`🎨 Fetching theme with ID: ${theme_id}`);
      const theme = await prisma.theme.findUnique({
        where: {
          id: Number(theme_id),
        },
      });
      console.info(`🎨 Theme fetch result: ${theme ? '✅ Found' : '❌ Not found'}`);

      console.info(`📦 Fetching blocks for user ID: ${user_id}`);
      const blocks = await prisma.block.findMany({
        where: {
          user_id: Number(user_id),
        },
      });
      console.info(`📦 Blocks fetched: ${blocks.length} blocks found`);

      const result = { user: { name, email, description, image }, theme, blocks };
      console.info('🔄 Preparing response with user data, theme, and blocks');

      console.info('✅ Successfully processed onelink request');
      console.groupEnd();

      res.status(201).json({
        result,
      });
    } catch (error) {
      console.error('❌ ERROR in getOnelink', error);
      console.groupEnd();
      res.status(500).json({ message: 'Server error' });
    }
  },
  async checkOnelink(req: Request, res: Response) {
    console.group('🔍 CHECK ONELINK REQUEST');
    console.info('📥 Received request to check onelink availability');
    const { onelink } = req.params;
    console.info(`🔍 Checking availability for: ${onelink}`);

    try {
      console.info('🔄 Querying database to count matching onelinks');
      const count = await prisma.user.count({
        where: {
          onelink: onelink,
        },
      });
      console.info(`🔢 Count result: ${count}`);

      if (count === 0) {
        console.info(`✅ Onelink "${onelink}" is available`);
        console.groupEnd();
        return res.status(201).json({ url: onelink, message: 'Available' });
      } else {
        console.info(`❌ Onelink "${onelink}" is already taken`);
        console.groupEnd();
        return res.status(201).json({ url: onelink, message: 'Taken' });
      }
    } catch (error) {
      console.error('❌ ERROR in checkOnelink', error);
      console.groupEnd();
      res.status(500).json({ message: 'Server error' });
    }
  },
};
