import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { listNodes, createNode, updateNode, deleteNode } from '../controllers/folderNodes.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', listNodes);
router.post('/', createNode);
router.patch('/:id', updateNode);
router.delete('/:id', deleteNode);

export default router;
