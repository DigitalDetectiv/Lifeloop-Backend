import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { listEntries, createEntry, revealEntry, deleteEntry } from '../controllers/vault.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', listEntries);
router.post('/', createEntry);
router.post('/:id/reveal', revealEntry);
router.delete('/:id', deleteEntry);

export default router;
