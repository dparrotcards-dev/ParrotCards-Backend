import { Router } from 'express';
import { DeckController } from '../controllers/deckController';
import { optionalAuth } from '../middleware/authMiddleware';

const router = Router();
const controller = new DeckController();

router.get('/definitions', (req, res, next) => controller.getCardDefinitions(req, res, next));
router.get('/:id', optionalAuth, (req, res, next) => controller.getDeck(req, res, next));
router.get('/:id/cards', optionalAuth, (req, res, next) => controller.getDeckCards(req, res, next));

export default router;
