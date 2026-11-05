import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { EntitlementService } from '../services/entitlementService';

const entitlementService = new EntitlementService();

export class EntitlementController {
  public async getMyEntitlements(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const entitlements = await entitlementService.getUserEntitlements(req.user?.id);
      res.json({
        success: true,
        data: entitlements,
      });
    } catch (err) {
      next(err);
    }
  }
}
