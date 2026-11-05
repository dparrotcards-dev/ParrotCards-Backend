import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { BirthProfile } from '../models/BirthProfile';
import { birthDetailsSchema } from '../validators/profileValidators';
import { AstronomyService } from '../integrations/astronomy/AstronomyService';
import { DeckService } from '../services/deckService';

const astronomyService = new AstronomyService();
const deckService = new DeckService();

export class ProfileController {
  public async createProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = birthDetailsSchema.parse(req.body);
      const userId = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : undefined;
      const guestSessionId = req.guestSessionId || validated.guestSessionId || req.body.guestSessionId;

      const utcDateTime = astronomyService.computeUtcDate(
        validated.date,
        validated.time,
        validated.timezone
      );

      // Save Birth Profile
      const profile = await BirthProfile.create({
        userId,
        guestSessionId,
        name: validated.name,
        gender: validated.gender,
        dateOfBirth: validated.date,
        timeOfBirth: validated.time,
        place: validated.place,
        latitude: validated.latitude,
        longitude: validated.longitude,
        timezone: validated.timezone,
        ianaTimezone: validated.ianaTimezone,
        utcDateTime,
      });

      // Automatically trigger calculation and deck generation
      const calculation = await astronomyService.getOrCalculate(
        profile._id as mongoose.Types.ObjectId,
        {
          name: profile.name,
          gender: profile.gender,
          date: profile.dateOfBirth,
          time: profile.timeOfBirth,
          place: profile.place,
          latitude: profile.latitude,
          longitude: profile.longitude,
          timezone: profile.timezone,
          ianaTimezone: profile.ianaTimezone,
        }
      );

      // Generate the 55 personalized cards
      const { deck, cards, entitlements } = await deckService.getOrGenerateDeck(
        profile,
        calculation,
        req.user?.id
      );

      // Pre-generate interpretations for the 3 free cards (Lagna, Sun, Moon) upon signup
      deckService.preGenerateFreeCardInterpretations(profile, deck, cards).catch((err) => {
        console.warn('⚠️ Background pre-generation of free-card interpretations failed safely:', err.message);
      });

      res.status(201).json({
        success: true,
        message: 'Birth sky successfully calculated and deck generated',
        data: {
          profile,
          calculation: {
            id: calculation._id,
            provider: calculation.provider,
            lagSign: calculation.lagSign,
            akPlanet: calculation.akPlanet,
            foundPointsCount: calculation.foundPointsCount,
            calculatedAt: calculation.calculatedAt,
          },
          deck,
          cards,
          entitlements,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getMyProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : undefined;
      const guestSessionId = req.guestSessionId;

      let query: any = {};
      if (userId) {
        query.userId = userId;
      } else if (guestSessionId) {
        query.guestSessionId = guestSessionId;
      } else {
        res.status(401).json({ success: false, message: 'Authentication required or valid guest session required' });
        return;
      }

      const profile = await BirthProfile.findOne(query).sort({ createdAt: -1 });
      if (!profile) {
        res.status(404).json({ success: false, message: 'No birth profile found' });
        return;
      }

      res.json({ success: true, data: { profile } });
    } catch (err) {
      next(err);
    }
  }

  public async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const validated = birthDetailsSchema.partial().parse(req.body);

      const profile = await BirthProfile.findById(id);
      if (!profile) {
        res.status(404).json({ success: false, message: 'Profile not found' });
        return;
      }

      // Security check: ensure user or guest owns this profile
      if (profile.userId) {
        if (!req.user || profile.userId.toString() !== req.user.id) {
          res.status(403).json({ success: false, message: 'Access denied to this profile' });
          return;
        }
      } else if (profile.guestSessionId) {
        if (!req.guestSessionId || profile.guestSessionId !== req.guestSessionId) {
          res.status(403).json({ success: false, message: 'Access denied: guest session required and must match' });
          return;
        }
      } else {
        res.status(403).json({ success: false, message: 'Access denied: profile has no owner' });
        return;
      }

      Object.assign(profile, validated);
      if (validated.date || validated.time || validated.timezone) {
        profile.utcDateTime = astronomyService.computeUtcDate(
          profile.dateOfBirth,
          profile.timeOfBirth,
          profile.timezone
        );
      }
      await profile.save();

      res.json({ success: true, message: 'Profile updated successfully', data: { profile } });
    } catch (err) {
      next(err);
    }
  }
}
