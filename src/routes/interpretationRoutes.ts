import { Router } from 'express';
import { InterpretationController } from '../controllers/interpretationController';
import { optionalAuth } from '../middleware/authMiddleware';

const router = Router();
const controller = new InterpretationController();

router.post('/cards/:key/interpretation', optionalAuth, (req, res, next) => controller.getCardInterpretation(req, res, next));
router.get('/decks/:id/avatar', optionalAuth, (req, res, next) => controller.getSovereignAvatar(req, res, next));

export default router;
