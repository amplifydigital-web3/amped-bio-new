import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { validateAdminInput } from '../middleware/validation';

const router = Router();

router.get('/users', adminController.userList);
// router.post('/spoof/:id', validateAdminInput, adminController.spoof);
// router.get('/export/users', validateAdminInput, adminController.exportUsers);

export default router;