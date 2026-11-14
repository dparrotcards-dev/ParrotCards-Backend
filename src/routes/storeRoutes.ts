import { Router } from 'express';
import { StoreController } from '../controllers/storeController';

const router = Router();
const controller = new StoreController();

// Public: no auth required
router.get('/products', (req, res, next) => controller.getProducts(req, res, next));
router.get('/razorpay-key', (req, res) => controller.getRazorpayKey(req, res));
router.post('/create-order', (req, res, next) => controller.createStoreOrder(req, res, next));
router.post('/verify-payment', (req, res, next) => controller.verifyStorePayment(req, res, next));
router.post('/orders', (req, res, next) => controller.placeStoreOrder(req, res, next));

export default router;
