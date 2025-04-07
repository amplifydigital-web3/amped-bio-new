import express from 'express';
import { blockController } from '../controllers/block.controller';

const router = express.Router();

// Block routes
router.put('/:user_id', blockController.editBlocks);
router.get('/:user_id', blockController.getAll);
router.get('/block/:id', blockController.get);
router.delete('/block/:id', blockController.delete);

export default router;
