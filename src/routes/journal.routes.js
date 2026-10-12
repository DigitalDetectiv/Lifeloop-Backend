import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getEntry, upsertEntry } from '../controllers/journal.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/:date', getEntry);
router.put('/:date', upsertEntry);

export default router;
