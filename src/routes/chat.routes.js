import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendMessage } from '../controllers/chat.controller.js';

const router = Router();
router.use(requireAuth);

router.post('/', sendMessage);

export default router;
