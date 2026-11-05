import { Router } from 'express';
import { AstronomyController } from '../controllers/astronomyController';
import { optionalAuth } from '../middleware/authMiddleware';

const router = Router();
const controller = new AstronomyController();

router.get('/:profileId', optionalAuth, (req, res, next) => controller.getCalculation(req, res, next));

export default router;
