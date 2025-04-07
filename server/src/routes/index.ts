import express from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import themeRoutes from './theme.routes';
import blockRoutes from './block.routes';
import onelinkRoutes from './onelink.routes';
import adminRoutes from './admin.routes';

const router = express.Router();

// Register all routes
router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/user/theme', themeRoutes);
router.use('/user/blocks', blockRoutes);
router.use('/onelink', onelinkRoutes);
router.use('/admin', adminRoutes);

export default router;
