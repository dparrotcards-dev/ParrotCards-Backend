import { Router } from 'express';
import { PaymentController } from '../controllers/paymentController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
const controller = new PaymentController();

router.post('/create-order', requireAuth, (req, res, next) => controller.createOrder(req, res, next));
router.post('/verify', requireAuth, (req, res, next) => controller.verifyPayment(req, res, next));
router.post('/webhook', (req, res, next) => controller.webhook(req, res, next));
router.get('/history', requireAuth, (req, res, next) => controller.getHistory(req, res, next));

export default router;
