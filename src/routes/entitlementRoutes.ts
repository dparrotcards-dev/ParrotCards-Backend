import { Router } from 'express';
import { EntitlementController } from '../controllers/entitlementController';
import { optionalAuth } from '../middleware/authMiddleware';

const router = Router();
const controller = new EntitlementController();

router.get('/', optionalAuth, (req, res, next) => controller.getMyEntitlements(req, res, next));

export default router;
