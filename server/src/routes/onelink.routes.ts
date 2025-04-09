import express from 'express';
import { onelinkController } from '../controllers/onelink.controller';

const router = express.Router();

// Onelink routes
router.get('/:onelink', onelinkController.getOnelink);
router.get('/check/:onelink', onelinkController.checkOnelink);

export default router;
