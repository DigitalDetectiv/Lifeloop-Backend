import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  listToday,
  listByDate,
  listRange,
  listByFolderNode,
  createTask,
  updateTask,
  toggleTask,
  deleteTask
} from '../controllers/tasks.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/today', listToday);
router.get('/by-date', listByDate);
router.get('/range', listRange);
router.get('/', listByFolderNode);
router.post('/', createTask);
router.patch('/:id', updateTask);
router.post('/:id/toggle', toggleTask);
router.delete('/:id', deleteTask);

export default router;
