import { Router } from 'express';
import { ContactMessageController } from '../controllers/contactMessageController';

const router = Router();
const controller = new ContactMessageController();

// Public: Submit message from Contact Us / Support Page
router.post('/', (req, res, next) => controller.createMessage(req, res, next));

export default router;

