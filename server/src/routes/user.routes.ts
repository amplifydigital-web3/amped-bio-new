import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { validateUserInput } from '../middleware/validation';

const router = Router();

// Save user
router.put('/:id', validateUserInput, userController.edit);
// Delete user
router.delete('/:id', validateUserInput, userController.delete);

export default router;