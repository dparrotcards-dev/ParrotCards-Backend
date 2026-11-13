import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { requireAuth } from '../middleware/authMiddleware';
import { authRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const controller = new AuthController();

router.post('/register', authRateLimiter, (req, res, next) => controller.register(req, res, next));
router.post('/login', authRateLimiter, (req, res, next) => controller.login(req, res, next));
router.post('/logout', (req, res) => controller.logout(req, res));
router.post('/forgot-password', authRateLimiter, (req, res, next) => controller.forgotPassword(req, res, next));
router.post('/reset-password', authRateLimiter, (req, res, next) => controller.resetPassword(req, res, next));
router.get('/me', requireAuth, (req, res, next) => controller.getMe(req, res, next));

export default router;
