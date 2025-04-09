import express from 'express';
import { themeController } from '../controllers/theme.controller';
import { authMiddleware } from '../middleware/auth';
import { validate, ValidationTarget } from '../middleware/validation.middleware';
import { editThemeSchema } from '../schemas/theme.schema';

const router = express.Router();

router.put(
  '/:id',
  authMiddleware(),
  validate(editThemeSchema, ValidationTarget.Body),
  themeController.editTheme
);
router.get('/:id', themeController.get);
router.delete('/:id', authMiddleware(), themeController.delete);

export default router;
