import { Router } from 'express';
import { AccountController } from '../controllers/accountController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
const controller = new AccountController();

router.get('/', requireAuth, (req, res, next) => controller.getAccount(req, res, next));
router.patch('/', requireAuth, (req, res, next) => controller.updateAccount(req, res, next));
router.delete('/', requireAuth, (req, res, next) => controller.deleteAccount(req, res, next));

export default router;
