import { Router } from 'express';
import { AdminController } from '../controllers/adminController';
import { requireAdmin, requireSuperAdmin } from '../middleware/authMiddleware';

const router = Router();
const controller = new AdminController();

// 1. Overview Dashboard Metrics
router.get('/stats', requireAdmin, (req, res, next) => controller.getDashboardStats(req, res, next));

// 2. User Management
router.get('/users', requireAdmin, (req, res, next) => controller.getUsers(req, res, next));
router.get('/users/:id', requireAdmin, (req, res, next) => controller.getUserDetails(req, res, next));
router.delete('/users/:id', requireAdmin, (req, res, next) => controller.deleteUser(req, res, next));

// 3. Deck Management
router.get('/decks', requireAdmin, (req, res, next) => controller.getDecks(req, res, next));
router.get('/decks/:id', requireAdmin, (req, res, next) => controller.getDeckDetails(req, res, next));

// 4. 55-Card Catalog Management
router.get('/cards', requireAdmin, (req, res, next) => controller.getCardsCatalog(req, res, next));
router.put('/cards/:id', requireAdmin, (req, res, next) => controller.updateCard(req, res, next));
router.patch('/cards/:id/access', requireSuperAdmin, (req, res, next) => controller.updateCardAccess(req, res, next));
router.delete('/cards/:id', requireAdmin, (req, res, next) => controller.deleteCard(req, res, next));

// 5. Payments & Verified Revenue
router.get('/payments', requireAdmin, (req, res, next) => controller.getPayments(req, res, next));
router.delete('/payments/:id', requireAdmin, (req, res, next) => controller.deletePayment(req, res, next));

// 6. Gemini AI Monitoring
router.get('/ai-monitoring', requireAdmin, (req, res, next) => controller.getAiMonitoring(req, res, next));

// 7. Astronomy Engine Monitoring
router.get('/astronomy', requireAdmin, (req, res, next) => controller.getAstronomyMonitoring(req, res, next));

// 8. Analytics Engine
router.get('/analytics', requireAdmin, (req, res, next) => controller.getAnalytics(req, res, next));

// 9. Operational System Diagnostics
router.get('/system', requireAdmin, (req, res, next) => controller.getSystemHealth(req, res, next));

// 10. Admin Accounts & Audit Logs
router.get('/admins', requireSuperAdmin, (req, res, next) => controller.getAdmins(req, res, next));
router.get('/audit-logs', requireAdmin, (req, res, next) => controller.getAuditLogs(req, res, next));

// 11. Admin Password Management
router.post('/change-password', requireAdmin, (req, res, next) => controller.changePassword(req, res, next));

// 12. Cosmic Store Product Management
router.post('/products', requireAdmin, (req, res, next) => controller.createProduct(req, res, next));
router.get('/products', requireAdmin, (req, res, next) => controller.getProducts(req, res, next));
router.put('/products/:id', requireAdmin, (req, res, next) => controller.updateProduct(req, res, next));
router.delete('/products/:id', requireAdmin, (req, res, next) => controller.deleteProduct(req, res, next));
router.patch('/products/:id/status', requireAdmin, (req, res, next) => controller.toggleProductStatus(req, res, next));
router.patch('/products/:id/stock', requireAdmin, (req, res, next) => controller.toggleProductStock(req, res, next));

export default router;
