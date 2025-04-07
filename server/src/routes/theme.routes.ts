import express from 'express';
import { themeController } from '../controllers/theme.controller';

const router = express.Router();

// Theme routes
router.put('/:id', themeController.editTheme);
router.get('/id', themeController.get);
router.delete('/id', themeController.delete);

export default router;
