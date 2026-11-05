import { Router } from 'express';
import authRoutes from './authRoutes';
import profileRoutes from './profileRoutes';
import locationRoutes from './locationRoutes';
import astronomyRoutes from './astronomyRoutes';
import deckRoutes from './deckRoutes';
import cardRoutes from './cardRoutes';
import interpretationRoutes from './interpretationRoutes';
import paymentRoutes from './paymentRoutes';
import entitlementRoutes from './entitlementRoutes';
import accountRoutes from './accountRoutes';
import adminRoutes from './adminRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/profiles', profileRoutes);
router.use('/locations', locationRoutes);
router.use('/astronomy', astronomyRoutes);
router.use('/decks', deckRoutes);
router.use('/cards', cardRoutes);
router.use('/interpretations', interpretationRoutes);
router.use('/payments', paymentRoutes);
router.use('/entitlements', entitlementRoutes);
router.use('/account', accountRoutes);
router.use('/admin', adminRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Parrot Cards Vedic API v1',
  });
});

export default router;
