import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { validateUserInput } from '../middleware/validation';
import { themeController } from '../controllers/theme.controller';
import { blockController } from '../controllers/block.controller';

const router = Router();

// Save user
router.put('/:id', validateUserInput, userController.edit);
// Get User
router.get('/:id', userController.get);
// Delete user
router.delete('/:id', validateUserInput, userController.delete);

// Edit Theme
router.put('/theme/:id', themeController.editTheme);
// Get Theme
router.get('/theme/id', themeController.get);
// delete Theme
router.delete('/theme/id', themeController.delete);

// Edit Blocks
router.put('/blocks/:user_id', blockController.editBlocks);
// Get All User Blocks
router.get('/blocks/:user_id', blockController.getAll);
// Get Block
router.get('/blocks/block/:id', blockController.get);
// Delete Block
router.delete('/blocks/block/:id', blockController.delete);

export default router;