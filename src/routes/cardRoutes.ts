import { Router } from 'express';
import { DeckController } from '../controllers/deckController';
import { optionalAuth } from '../middleware/authMiddleware';

const router = Router();
const controller = new DeckController();

router.get('/:key', optionalAuth, (req, res, next) => controller.getCardDetail(req, res, next));

export default router;
