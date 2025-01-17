import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validateAuthInput } from '../middleware/validation';

const router = Router();

router.post('/register', validateAuthInput, authController.register);
router.post('/login', validateAuthInput, authController.login);
router.post('/password-reset', authController.passwordReset);
router.post('/password-reset-request', validateAuthInput, authController.passwordResetRequest);

export default router;