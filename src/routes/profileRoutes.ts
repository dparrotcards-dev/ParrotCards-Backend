import { Router } from 'express';
import { ProfileController } from '../controllers/profileController';
import { optionalAuth, requireAuth } from '../middleware/authMiddleware';

const router = Router();
const controller = new ProfileController();

router.post('/', optionalAuth, (req, res, next) => controller.createProfile(req, res, next));
router.get('/my', optionalAuth, (req, res, next) => controller.getMyProfile(req, res, next));
router.get('/me', optionalAuth, (req, res, next) => controller.getMyProfile(req, res, next));
router.patch('/:id', optionalAuth, (req, res, next) => controller.updateProfile(req, res, next));

export default router;
