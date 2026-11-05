import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const controller = new AuthController();

router.post('/register', authRateLimiter, (req, res, next) => controller.register(req, res, next));
router.post('/login', authRateLimiter, (req, res, next) => controller.login(req, res, next));
router.post('/logout', (req, res) => controller.logout(req, res));
router.get('/me', requireAuth, (req, res, next) => controller.getMe(req, res, next));

export default router;
