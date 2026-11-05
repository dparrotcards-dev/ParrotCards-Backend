import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { AstronomyService } from '../integrations/astronomy/AstronomyService';
import { AstronomicalCalculation } from '../models/AstronomicalCalculation';
import { BirthProfile } from '../models/BirthProfile';

const astronomyService = new AstronomyService();

export class AstronomyController {
  public async getCalculation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { profileId } = req.params;

      const profile = await BirthProfile.findById(profileId);
      if (!profile) {
        res.status(404).json({ success: false, message: 'Profile not found' });
        return;
      }

      // Privacy check: profile must belong to the authenticated user or matching guest session
      if (profile.userId) {
        if (!req.user || profile.userId.toString() !== req.user.id) {
          res.status(403).json({ success: false, message: 'Unauthorized access to this calculation' });
          return;
        }
      } else if (profile.guestSessionId) {
        if (!req.guestSessionId || profile.guestSessionId !== req.guestSessionId) {
          res.status(403).json({ success: false, message: 'Unauthorized access to this calculation: guest session required and must match' });
          return;
        }
      } else {
        res.status(403).json({ success: false, message: 'Unauthorized access to this calculation: profile has no owner' });
        return;
      }

      const calculation = await AstronomicalCalculation.findOne({ profileId: profile._id }).sort({ calculatedAt: -1 });
      if (!calculation) {
        res.status(404).json({ success: false, message: 'Astronomical calculation not found for this profile' });
        return;
      }

      res.json({
        success: true,
        data: {
          calculation,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
