import mongoose from 'mongoose';
import { CardDefinition } from '../models/CardDefinition';
import { PersonalizedDeck, IPersonalizedDeck } from '../models/PersonalizedDeck';
import { PersonalizedCard, IPersonalizedCard } from '../models/PersonalizedCard';
import { IAstronomicalCalculation } from '../models/AstronomicalCalculation';
import { IBirthProfile } from '../models/BirthProfile';
import { GeminiService } from '../integrations/gemini/GeminiService';
import { EntitlementService, FREE_CARD_KEYS } from './entitlementService';
import { APPROVED_55_CARDS } from '../utils/seedCards';
import { IAstronomicalPlacement } from '../types';
import { computeNavamsha, getHouseLord, SIGN_NAMES } from '../utils/astroMath';

export class DeckService {
  private geminiService: GeminiService;
  private entitlementService: EntitlementService;

  constructor() {
    this.geminiService = new GeminiService();
    this.entitlementService = new EntitlementService();
  }

  /**
   * Get existing personalized deck or generate a new 55-card deck
   */
  public async getOrGenerateDeck(
    profile: IBirthProfile,
    calculation: IAstronomicalCalculation,
    userId?: string
  ): Promise<{
    deck: any;
    cards: Array<Record<string, any>>;
    entitlements: Record<string, any>;
  }> {
    const profileId = profile._id as mongoose.Types.ObjectId;
    let deck = await PersonalizedDeck.findOne({ profileId }).sort({ createdAt: -1 });

    const entitlements = await this.entitlementService.getUserEntitlements(userId);

    // If deck does not exist, build all 55 cards
    if (!deck) {
      deck = await this.createPersonalizedDeck(profile, calculation, userId);
    }

    if (!deck) {
      throw new Error('Failed to create or retrieve personalized deck');
    }

    // Fetch the 55 cards for this deck
    const cards = await PersonalizedCard.find({ deckId: deck._id }).sort({ position: 1 });

    // Format and enrich with server-enforced unlock status
    const enrichedCards = cards.map((c) => {
      const isCardFree = (entitlements.freeCardKeys || FREE_CARD_KEYS).includes(c.key);
      const isUnlocked = isCardFree || this.entitlementService.isCardUnlocked(c.key, entitlements);

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
              // Mask sensitive details if locked
              sign: null,
              house: null,
              nak: null,
              deg: null,
              navamshaSign: null,
              navamshaSignName: null,
              houseLord: null,
              isSovereign: c.isSovereign,
            },
        isSovereign: c.isSovereign,
        isFree: isCardFree,
        isUnlocked,
      };
    });

    return {
      deck,
      cards: enrichedCards,
      entitlements,
    };
  }

  /**
   * Create exactly 55 personalized cards and save to MongoDB
   */
  public async createPersonalizedDeck(
    profile: IBirthProfile,
    calculation: IAstronomicalCalculation,
    userId?: string
  ): Promise<any> {
    const parsedPoints: Record<string, IAstronomicalPlacement> = calculation.parsedPoints || {};
    const akPlanet = calculation.akPlanet || 'Sun';
    const akPlacement = parsedPoints[akPlanet] || { sign: calculation.lagSign || 0, house: 1 };

    // Generate Sovereign Avatar Phrase
    const avatar = await this.geminiService.generateSovereignAvatar(
      akPlanet,
      akPlacement,
      profile.name,
      profile.dateOfBirth,
      profile.gender
    );

    // Ensure card definitions are seeded
    let cardDefs = await CardDefinition.find().sort({ position: 1 });
    if (cardDefs.length < 55) {
      for (const card of APPROVED_55_CARDS) {
        const cardId = `${card.suit.toUpperCase()}_${card.rank.replace(/\s+/g, '_')}_${card.position}`;
        await CardDefinition.findOneAndUpdate(
          { position: card.position },
          { $set: { ...card, cardId } },
          { upsert: true, new: true }
        );
      }
      cardDefs = await CardDefinition.find().sort({ position: 1 });
    }

    const deck = await PersonalizedDeck.create({
      userId: userId ? new mongoose.Types.ObjectId(userId) : profile.userId,
      guestSessionId: profile.guestSessionId,
      profileId: profile._id,
      calculationId: calculation._id,
      sovereignCardKey: akPlanet,
      avatarPhrase: avatar.avatarPhrase,
      avatarSummary: avatar.avatarSummary,
      isAvatarAiGenerated: !!avatar.isAiGenerated,
      totalCards: 55,
      generatedAt: new Date(),
    });

    // Create 55 personalized cards
    const cardsToInsert = cardDefs.map((def) => {
      const placement = parsedPoints[def.key] || {
        sign: null,
        signName: undefined,
        deg: null,
        house: null,
        nak: null,
        pada: null,
        lord: null,
        nadi: null,
        ruler: null,
        kar: null,
        state: null,
        isSovereign: def.key === akPlanet,
      };

      const isSovereign = def.key === akPlanet || def.suit === 'MasterKey';
      const isFree = def.isFreeByDefault !== undefined ? def.isFreeByDefault : FREE_CARD_KEYS.includes(def.key);

      const defaultNav = computeNavamsha(placement.sign, placement.deg);
      const enrichedPlacement: IAstronomicalPlacement = {
        ...placement,
        navamshaSign: placement.navamshaSign ?? defaultNav.navamshaSign,
        navamshaSignName: placement.navamshaSignName ?? defaultNav.navamshaSignName,
        houseLord: placement.houseLord ?? getHouseLord(placement.sign),
        isSovereign,
      };

      return {
        deckId: deck._id,
        cardDefId: def._id,
        userId: userId ? new mongoose.Types.ObjectId(userId) : profile.userId,
        guestSessionId: profile.guestSessionId,
        cardId: def.cardId,
        suit: def.suit,
        suitSymbol: def.suitSymbol,
        rank: def.rank,
        label: def.label,
        key: def.key,
        title: def.title,
        line: def.line,
        shortSummary: def.shortSummary,
        position: def.position,
        astronomicalPlacement: enrichedPlacement,
        isSovereign,
        isFree,
      };
    });

    await PersonalizedCard.insertMany(cardsToInsert);
    return deck;
  }

  /**
   * Pre-generates/caches interpretations for the 3 free cards (Lagna, Sun, Moon) upon signup/deck creation.
   * Runs asynchronously without blocking profile creation or risking failures.
   */
  public async preGenerateFreeCardInterpretations(
    profile: IBirthProfile,
    deck: any,
    cards: Array<Record<string, any>>
  ): Promise<void> {
    const freeCardKeys = await this.entitlementService.getFreeCardKeys();
    const freeCards = cards.filter((c) => freeCardKeys.includes(c.key));
    const results = await Promise.allSettled(
      freeCards.map(async (c) => {
        return this.geminiService.getCardInterpretation(
          c.key,
          c.title,
          c.suit,
          c.astronomicalPlacement || {},
          profile.name,
          profile.userId?.toString(),
          { dateOfBirth: profile.dateOfBirth, gender: profile.gender }
        );
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`✨ Pre-generated interpretations for ${successful}/${freeCards.length} free cards for ${profile.name}`);
  }
}
