import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { PersonalizedCard } from '../models/PersonalizedCard';
import { PersonalizedDeck } from '../models/PersonalizedDeck';
import { GeminiService } from '../integrations/gemini/GeminiService';
import { EntitlementService, FREE_CARD_KEYS } from '../services/entitlementService';

const geminiService = new GeminiService();
const entitlementService = new EntitlementService();

export class InterpretationController {
  public async getCardInterpretation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { key } = req.params;
      const { deckId, userName = 'Seeker' } = req.body;

      const entitlements = await entitlementService.getUserEntitlements(req.user?.id);
      const isFree = (entitlements.freeCardKeys || FREE_CARD_KEYS).includes(key);
      const isUnlocked = isFree || entitlementService.isCardUnlocked(key, entitlements);

      if (!isUnlocked) {
        res.status(402).json({
          success: false,
          message: 'Payment required to read deep AI interpretation for this card.',
          isUnlocked: false,
          unlockPriceRupees: 2,
        });
        return;
      }

      // Fetch the card from personalized deck or definition
      let cardPlacement: any = {};
      let cardTitle = key;
      let cardTheme = 'Vedic Astrological Insight';
      let dateOfBirth: string | undefined;
      let gender: string | undefined;

      if (deckId) {
        const deck = await PersonalizedDeck.findById(deckId).populate('profileId');
        if (!deck) {
          res.status(404).json({ success: false, message: 'Personalized deck not found' });
          return;
        }

        // Verify ownership strictly
        if (deck.userId) {
          if (!req.user || deck.userId.toString() !== req.user.id) {
            res.status(403).json({ success: false, message: 'Access denied: deck does not belong to you' });
            return;
          }
        } else if (deck.guestSessionId) {
          if (!req.guestSessionId || deck.guestSessionId !== req.guestSessionId) {
            res.status(403).json({ success: false, message: 'Access denied: guest session required and must match' });
            return;
          }
        } else {
          res.status(403).json({ success: false, message: 'Access denied: deck has no owner' });
          return;
        }

        const profile = deck.profileId as any;
        if (profile) {
          dateOfBirth = profile.dateOfBirth;
          gender = profile.gender;
        }

        const card = await PersonalizedCard.findOne({ deckId: deck._id, key });
        if (card) {
          cardPlacement = card.astronomicalPlacement;
          cardTitle = card.title;
          cardTheme = card.suit;
        }
      }

      const interpretation = await geminiService.getCardInterpretation(
        key,
        cardTitle,
        cardTheme,
        cardPlacement,
        userName,
        req.user?.id,
        { dateOfBirth, gender }
      );

      res.json({
        success: true,
        data: {
          cardKey: key,
          cardTitle,
          interpretation,
          isUnlocked: true,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getSovereignAvatar(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const deck = await PersonalizedDeck.findById(id).populate('profileId');
      if (!deck) {
        res.status(404).json({ success: false, message: 'Deck not found' });
        return;
      }

      // Verify ownership strictly
      if (deck.userId) {
        if (!req.user || deck.userId.toString() !== req.user.id) {
          res.status(403).json({ success: false, message: 'Access denied: avatar belongs to another user' });
          return;
        }
      } else if (deck.guestSessionId) {
        if (!req.guestSessionId || deck.guestSessionId !== req.guestSessionId) {
          res.status(403).json({ success: false, message: 'Access denied: guest session required and must match' });
          return;
        }
      } else {
        res.status(403).json({ success: false, message: 'Access denied: deck has no owner' });
        return;
      }

      res.json({
        success: true,
        data: {
          sovereignCardKey: deck.sovereignCardKey,
          avatarPhrase: deck.avatarPhrase,
          avatarSummary: deck.avatarSummary,
          isAvatarAiGenerated: !!deck.isAvatarAiGenerated,
          generatedAt: deck.generatedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
