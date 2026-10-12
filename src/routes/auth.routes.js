import { Router } from 'express';
import { register, login, refresh, logout, me, googleAuth, googleCallback } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

router.get('/google', googleAuth);
router.get('/google/callback', ...googleCallback);

export default router;
