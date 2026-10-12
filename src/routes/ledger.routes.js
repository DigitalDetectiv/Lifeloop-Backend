import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { listEntries, createEntry, updateEntry, deleteEntry } from '../controllers/ledger.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', listEntries);
router.post('/', createEntry);
router.patch('/:id', updateEntry);
router.delete('/:id', deleteEntry);

export default router;
