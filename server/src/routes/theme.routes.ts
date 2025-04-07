import express from 'express';
import { themeController } from '../controllers/theme.controller';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.put('/:id', authMiddleware(), themeController.editTheme);
router.get('/:id', themeController.get);
router.delete('/:id', authMiddleware(), themeController.delete);

export default router;
