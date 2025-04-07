import express from 'express';
import { userController } from '../controllers/user.controller';
import { validateUserInput } from '../middleware/validation';

const router = express.Router();

// User routes
router.put('/:id', validateUserInput, userController.edit);
router.get('/:id', userController.get);
router.delete('/:id', validateUserInput, userController.delete);

export default router;
