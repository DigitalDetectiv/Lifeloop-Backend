import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { todayStats, currentStreak } from '../controllers/analytics.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/today', todayStats);
router.get('/streak', currentStreak);

export default router;
