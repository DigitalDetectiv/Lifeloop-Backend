import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { updateMe, resetData } from '../controllers/users.controller.js';

const router = Router();
router.use(requireAuth);

router.patch('/me', updateMe);
router.post('/me/reset-data', resetData);

export default router;
