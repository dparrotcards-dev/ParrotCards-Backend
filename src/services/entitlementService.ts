import mongoose from 'mongoose';
import { CardUnlock } from '../models/CardUnlock';
import { DeckPass } from '../models/DeckPass';
import { CardDefinition } from '../models/CardDefinition';
import { IEntitlementStatus } from '../types';

export const DEFAULT_FREE_CARD_KEYS = ['Lagna', 'Sun', 'Moon'];
export const FREE_CARD_KEYS = DEFAULT_FREE_CARD_KEYS;

export class EntitlementService {
  /**
   * Dynamically query all card definitions marked as free by Super Admin
   */
  public static async getFreeCardKeys(): Promise<string[]> {
    try {
      const freeCards = await CardDefinition.find({ isFreeByDefault: true }).select('key').lean();
      if (freeCards && freeCards.length > 0) {
        return freeCards.map((c) => c.key);
      }
    } catch (err: any) {
      console.warn('⚠️ Failed to query free card definitions, falling back to default:', err.message);
    }
    return DEFAULT_FREE_CARD_KEYS;
  }

  public async getFreeCardKeys(): Promise<string[]> {
    return EntitlementService.getFreeCardKeys();
  }

  /**
   * Determine full entitlement status for a user
   */
  public async getUserEntitlements(userId?: string): Promise<IEntitlementStatus> {
    const freeCardKeys = await this.getFreeCardKeys();

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return {
        isDeckPassActive: false,
        deckPassExpiresAt: null,
        unlockedCardKeys: [],
        freeCardKeys,
      };
    }

    const uid = new mongoose.Types.ObjectId(userId);

    // 1. Check for active Deck Pass
    const now = new Date();
    const activePass = await DeckPass.findOne({
      userId: uid,
      isActive: true,
      expiresAt: { $gt: now },
    }).sort({ expiresAt: -1 });

    const isDeckPassActive = !!activePass;
    const deckPassExpiresAt = activePass ? activePass.expiresAt : null;

    // 2. Fetch individually unlocked cards
    const cardUnlocks = await CardUnlock.find({ userId: uid });
    const unlockedCardKeys = cardUnlocks.map((u) => u.cardKey);

    return {
      isDeckPassActive,
      deckPassExpiresAt,
      unlockedCardKeys,
      freeCardKeys,
    };
  }

  /**
   * Check whether a specific card is unlocked for a user or session
   */
  public isCardUnlocked(
    cardKey: string,
    entitlements: IEntitlementStatus
  ): boolean {
    // 1. Dynamic free cards check from entitlements
    const freeKeys = entitlements?.freeCardKeys || DEFAULT_FREE_CARD_KEYS;
    if (freeKeys.includes(cardKey)) {
      return true;
    }

    // 2. If user has active 30-day deck pass, all cards are unlocked
    if (entitlements.isDeckPassActive) {
      return true;
    }

    // 3. Check individual unlock
    return entitlements.unlockedCardKeys.includes(cardKey);
  }
}
