import { Router } from 'express';
import { LocationController } from '../controllers/locationController';

const router = Router();
const controller = new LocationController();

router.get('/search', (req, res, next) => controller.search(req, res, next));

export default router;
