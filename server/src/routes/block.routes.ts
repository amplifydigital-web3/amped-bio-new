import express from 'express';
import { blockController } from '../controllers/block.controller';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

// Block routes
router.put('/', authMiddleware(), blockController.editBlocks);
router.get('/', blockController.getAll);
router.get('/block/:id', blockController.get);
router.delete('/block/:id', authMiddleware(), blockController.delete);

export default router;
