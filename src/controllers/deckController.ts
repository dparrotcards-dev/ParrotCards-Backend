import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { PersonalizedDeck } from '../models/PersonalizedDeck';
import { PersonalizedCard } from '../models/PersonalizedCard';
import { CardDefinition } from '../models/CardDefinition';
import { EntitlementService, FREE_CARD_KEYS } from '../services/entitlementService';
import { computeNavamsha, getHouseLord, SIGN_NAMES } from '../utils/astroMath';
import { IAstronomicalPlacement } from '../types';

const entitlementService = new EntitlementService();

export class DeckController {
  public async getDeck(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const deck = await PersonalizedDeck.findById(id).populate('profileId');
      if (!deck) {
        res.status(404).json({ success: false, message: 'Deck not found' });
        return;
      }

      // Strict ownership check:
      // User-owned deck requires matching authenticated user.
      // Guest-owned deck requires matching guest session header (reject if missing or mismatched).
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

      const entitlements = await entitlementService.getUserEntitlements(deck.userId ? deck.userId.toString() : req.user?.id);

      res.json({
        success: true,
        data: {
          deck,
          entitlements,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getDeckCards(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const deck = await PersonalizedDeck.findById(id);
      if (!deck) {
        res.status(404).json({ success: false, message: 'Deck not found' });
        return;
      }

      // Strict ownership check: user-owned requires authenticated owner; guest-owned requires matching guest session
      if (deck.userId) {
        if (!req.user || deck.userId.toString() !== req.user.id) {
          res.status(403).json({ success: false, message: 'Access denied: cards belong to another user' });
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

      // Entitlements must be evaluated against the current requester (req.user?.id)
      const entitlements = await entitlementService.getUserEntitlements(req.user?.id);
      const cards = await PersonalizedCard.find({ deckId: deck._id }).sort({ position: 1 });
      const cardDefs = await CardDefinition.find().lean();
      const cardDefMap = new Map(cardDefs.map((cd) => [cd.key, cd]));

      const enrichedCards = cards.map((c) => {
        const isCardFree = (entitlements.freeCardKeys || FREE_CARD_KEYS).includes(c.key);
        const isUnlocked = isCardFree || entitlementService.isCardUnlocked(c.key, entitlements);
        const cardDef = cardDefMap.get(c.key);
        const price = isCardFree ? 0 : (cardDef?.price !== undefined ? cardDef.price : 2);

        const rawPlacement = (c.astronomicalPlacement || {}) as IAstronomicalPlacement;
        const placement: IAstronomicalPlacement = { ...rawPlacement };
        if (placement.sign != null) {
          if (placement.navamshaSign == null) {
            const nav = computeNavamsha(placement.sign, placement.deg ?? 0);
            placement.navamshaSign = nav.navamshaSign;
            placement.navamshaSignName = nav.navamshaSignName;
          }
          if (!placement.houseLord) {
            placement.houseLord = getHouseLord(placement.sign);
          }
          if (!placement.signName && placement.sign >= 0 && placement.sign < 12) {
            placement.signName = SIGN_NAMES[placement.sign];
          }
        }

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
          astronomicalPlacement: isUnlocked
            ? placement
            : {
                sign: null,
                signName: null,
                house: null,
                nak: null,
                deg: null,
                navamshaSign: null,
                navamshaSignName: null,
                houseLord: null,
                nadi: null,
                lord: null,
                ruler: null,
                state: null,
                kar: null,
                isSovereign: c.isSovereign,
              },
          isSovereign: c.isSovereign,
          isFree: isCardFree,
          isUnlocked,
          price,
        };
      });

      res.json({
        success: true,
        count: enrichedCards.length,
        data: {
          deckId: deck._id,
          sovereignCardKey: deck.sovereignCardKey,
          avatarPhrase: deck.avatarPhrase,
          cards: enrichedCards,
          entitlements,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getCardDetail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { key } = req.params;
      const entitlements = await entitlementService.getUserEntitlements(req.user?.id);

      const isFree = (entitlements.freeCardKeys || FREE_CARD_KEYS).includes(key);
      const isUnlocked = isFree || entitlementService.isCardUnlocked(key, entitlements);

      const cardDef = await CardDefinition.findOne({ key });
      if (!cardDef) {
        res.status(404).json({ success: false, message: `Card with key "${key}" not found` });
        return;
      }

      res.json({
        success: true,
        data: {
          card: {
            cardId: cardDef.cardId,
            suit: cardDef.suit,
            suitSymbol: cardDef.suitSymbol,
            suitName: cardDef.suitName,
            suitTheme: cardDef.suitTheme,
            rank: cardDef.rank,
            label: cardDef.label,
            key: cardDef.key,
            title: cardDef.title,
            line: cardDef.line,
            shortSummary: cardDef.shortSummary,
            detailedInterpretation: isUnlocked ? cardDef.detailedInterpretation : 'Locked content. Unlock this card or acquire a 30-day deck pass to read full analysis.',
            reflectionQuestion: isUnlocked ? cardDef.reflectionQuestion : 'Locked content. Tap unlock to reveal your reflection question.',
            position: cardDef.position,
            isFree,
            isUnlocked,
            price: isFree ? 0 : (cardDef.price !== undefined ? cardDef.price : 2),
          },
          entitlements,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async getCardDefinitions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cards = await CardDefinition.find().sort({ position: 1 });
      res.json({
        success: true,
        count: cards.length,
        data: cards,
      });
    } catch (err) {
      next(err);
    }
  }
}
