import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../controllers/categories.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', listCategories);
router.post('/', createCategory);
router.patch('/:id', updateCategory);
router.delete('/:id', deleteCategory);

export default router;
