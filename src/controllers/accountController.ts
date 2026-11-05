import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { User } from '../models/User';
import { BirthProfile } from '../models/BirthProfile';
import { PersonalizedDeck } from '../models/PersonalizedDeck';
import { PersonalizedCard } from '../models/PersonalizedCard';
import { EntitlementService } from '../services/entitlementService';

const entitlementService = new EntitlementService();

export class AccountController {
  public async getAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const user = await User.findById(req.user.id).select('-passwordHash');
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      if (req.guestSessionId) {
        await BirthProfile.updateMany(
          { guestSessionId: req.guestSessionId, userId: { $exists: false } },
          { $set: { userId: user._id } }
        );
        await PersonalizedDeck.updateMany(
          { guestSessionId: req.guestSessionId, userId: { $exists: false } },
          { $set: { userId: user._id } }
        );
        await PersonalizedCard.updateMany(
          { guestSessionId: req.guestSessionId, userId: { $exists: false } },
          { $set: { userId: user._id } }
        );
      }

      const profiles = await BirthProfile.find({ userId: user._id }).sort({ createdAt: -1 });
      const decks = await PersonalizedDeck.find({ userId: user._id }).sort({ createdAt: -1 });
      const entitlements = await entitlementService.getUserEntitlements(user._id.toString());

      let activeDeckData: any = null;
      if (decks.length > 0) {
        const latestDeck = decks[0];
        const latestProfile = profiles.find((p) => p._id.toString() === latestDeck.profileId?.toString()) || profiles[0] || null;
        const cards = await PersonalizedCard.find({ deckId: latestDeck._id }).sort({ position: 1 });
        const enrichedCards = cards.map((c) => {
          const isCardFree = (entitlements.freeCardKeys || []).includes(c.key);
          const isUnlocked = isCardFree || entitlementService.isCardUnlocked(c.key, entitlements);
          return {
            _id: c._id,
            cardId: c.cardId,
            suit: c.suit,
            suitSymbol: c.suitSymbol,
            rank: c.rank,
            label: c.label,
            key: c.key,
            title: c.title,
            line: c.line,
            shortSummary: c.shortSummary,
            position: c.position,
            astronomicalPlacement: isUnlocked ? c.astronomicalPlacement : null,
            isSovereign: c.isSovereign,
            isFree: isCardFree,
            isUnlocked,
          };
        });

        activeDeckData = {
          deck: latestDeck,
          profile: latestProfile,
          cards: enrichedCards,
        };
      }

      res.json({
        success: true,
        data: {
          user,
          profiles,
          decks,
          entitlements,
          activeDeckData,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const { name } = req.body;
      const user = await User.findById(req.user.id);
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      if (name) user.name = name.trim();
      await user.save();

      res.json({
        success: true,
        message: 'Account profile updated',
        data: {
          user: {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async deleteAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      await User.findByIdAndDelete(req.user.id);
      res.clearCookie('token');

      res.json({
        success: true,
        message: 'Account and associated session deleted successfully',
      });
    } catch (err) {
      next(err);
    }
  }
}
