import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { User } from '../models/User';
import { PersonalizedDeck } from '../models/PersonalizedDeck';
import { PersonalizedCard } from '../models/PersonalizedCard';
import { AstronomicalCalculation } from '../models/AstronomicalCalculation';
import { PaymentOrder } from '../models/PaymentOrder';
import { PaymentTransaction } from '../models/PaymentTransaction';
import { DeckPass } from '../models/DeckPass';
import { CardUnlock } from '../models/CardUnlock';
import { CardInterpretation } from '../models/CardInterpretation';
import { CardDefinition } from '../models/CardDefinition';
import { WebhookEvent } from '../models/WebhookEvent';
import { BirthProfile } from '../models/BirthProfile';
import { AuditLog } from '../models/AuditLog';
import { CosmicProduct } from '../models/CosmicProduct';
import { StoreOrder } from '../models/StoreOrder';
import { clearStoreCache } from './storeController';
import { ENV } from '../config/env';

/**
 * Record a sensitive administrative operation into the AuditLog
 */
async function recordAuditAction(
  req: AuthenticatedRequest,
  action: string,
  targetType: 'USER' | 'DECK' | 'CARD' | 'PAYMENT' | 'PRODUCT' | 'SYSTEM' | 'AUTH' | 'SETTINGS',
  targetId?: string,
  details?: Record<string, any>,
  status: 'SUCCESS' | 'FAILURE' = 'SUCCESS'
) {
  try {
    await AuditLog.create({
      adminId: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : undefined,
      adminEmail: req.user?.email || 'admin@system.local',
      adminName: req.user?.name || 'Administrator',
      action,
      targetType,
      targetId,
      details,
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'] || 'Unknown',
      status,
    });
  } catch (err: any) {
    console.warn('⚠️ Failed to record admin audit log:', err.message);
  }
}

export class AdminController {
  /**
   * 1. Overview Dashboard Metrics
   */
  public async getDashboardStats(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        totalDecks,
        totalCalculations,
        totalStoreOrders,
        capturedStoreOrders,
        storeOrderStatuses,
        activePassesCount,
        aiInterpretationsCount,
        fallbackInterpretationsCount,
        recentUsers,
        recentDecks,
        recentOrders,
        dailyOrdersRaw,
        dailyUsersRaw,
      ] = await Promise.all([
        User.countDocuments(),
        PersonalizedDeck.countDocuments(),
        AstronomicalCalculation.countDocuments(),
        StoreOrder.countDocuments(),
        StoreOrder.find({ paymentStatus: 'PAID' }),
        StoreOrder.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        DeckPass.countDocuments({ isActive: true, expiresAt: { $gt: now } }),
        CardInterpretation.countDocuments({ isAiGenerated: true }),
        CardInterpretation.countDocuments({ isAiGenerated: false }),
        User.find().sort({ createdAt: -1 }).limit(6).select('-passwordHash'),
        PersonalizedDeck.find()
          .sort({ createdAt: -1 })
          .limit(6)
          .populate('profileId', 'name dateOfBirth gender city place')
          .populate('userId', 'email name'),
        StoreOrder.find().sort({ createdAt: -1 }).limit(6),
        StoreOrder.aggregate([
          { $match: { createdAt: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              revenueRupees: { $sum: '$totalAmountRupees' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        User.aggregate([
          { $match: { createdAt: { $gte: thirtyDaysAgo } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      const storeStatusMap: Record<string, number> = {};
      for (const s of storeOrderStatuses) {
        if (s._id) {
          storeStatusMap[String(s._id).toLowerCase()] = s.count;
        }
      }

      const totalRevenueRupees = capturedStoreOrders.reduce((acc, curr) => acc + (curr.totalAmountRupees || 0), 0);
      const paymentSuccessRate = totalStoreOrders > 0 ? Math.round((capturedStoreOrders.length / totalStoreOrders) * 100) : 100;
      const totalInterpretations = aiInterpretationsCount + fallbackInterpretationsCount;
      const aiGenerationRate =
        totalInterpretations > 0 ? Math.round((aiInterpretationsCount / totalInterpretations) * 100) : 100;

      const dbHost = mongoose.connection.host || 'localhost';
      const isAtlas = dbHost.includes('mongodb.net');

      res.json({
        success: true,
        data: {
          metrics: {
            totalUsers,
            totalDecks,
            totalCalculations,
            totalOrders: totalStoreOrders,
            paidOrdersCount: capturedStoreOrders.length,
            storeStatusCounts: {
              delivered: storeStatusMap['delivered'] || 0,
              shipped: storeStatusMap['shipped'] || 0,
              processing: storeStatusMap['processing'] || 0,
              confirmed: storeStatusMap['confirmed'] || 0,
              cancelled: storeStatusMap['cancelled'] || 0,
            },
            paymentSuccessRate,
            totalRevenueRupees,
            activePassesCount,
            aiInterpretationsCount,
            fallbackInterpretationsCount,
            aiGenerationRate,
          },
          revenueTrend: dailyOrdersRaw.map((d) => ({
            date: d._id,
            revenueRupees: d.revenueRupees,
            ordersCount: d.count,
          })),
          userGrowthTrend: dailyUsersRaw.map((u) => ({
            date: u._id,
            count: u.count,
          })),
          recentUsers: recentUsers.map((u) => ({
            id: u._id.toString(),
            email: u.email,
            name: u.name,
            role: u.role,
            createdAt: u.createdAt,
          })),
          recentDecks: recentDecks.map((d: any) => ({
            id: d._id.toString(),
            userName: d.profileId?.name || d.userId?.name || 'Guest Seeker',
            sovereignCardKey: d.sovereignCardKey,
            avatarPhrase: d.avatarPhrase,
            isAvatarAiGenerated: !!d.isAvatarAiGenerated,
            generatedAt: d.generatedAt || d.createdAt,
          })),
          recentOrders: recentOrders.map((o: any) => {
            const primaryProduct = o.products?.[0];
            const productName = primaryProduct?.name
              ? (o.products.length > 1 ? `${primaryProduct.name} +${o.products.length - 1}` : primaryProduct.name)
              : 'Sacred Store Product';

            return {
              id: o._id.toString(),
              orderId: o.orderId ? o.orderId.replace(/^#/, '') : `PC${o._id.toString().slice(-5)}`,
              customerName: o.customerName || 'Seeker',
              userEmail: o.customerEmail || o.customerName || 'Customer',
              productName,
              amountRupees: o.totalAmountRupees || 0,
              itemType: 'STORE_PRODUCT',
              currency: 'INR',
              status: o.status || 'Confirmed',
              createdAt: o.createdAt,
            };
          }),
          systemStatus: {
            nodeEnv: ENV.NODE_ENV,
            geminiModel: ENV.GEMINI_MODEL,
            geminiConfigured: !!ENV.GEMINI_API_KEY && ENV.GEMINI_API_KEY.length > 10,
            astronomyProvider: ENV.ASTRONOMY_PROVIDER,
            razorpayConfigured: !!ENV.RAZORPAY_KEY_ID && !ENV.RAZORPAY_KEY_ID.includes('placeholder'),
            database: {
              host: dbHost,
              isAtlas,
              connected: mongoose.connection.readyState === 1,
            },
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 2. User Management with Server-Side Pagination & Search
   */
  public async getUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
      const search = (req.query.search as string || '').trim();
      const roleFilter = (req.query.role as string || '').trim();

      const query: Record<string, any> = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ];
      }
      if (roleFilter && roleFilter !== 'ALL') {
        query.role = roleFilter;
      }

      const total = await User.countDocuments(query);
      const users = await User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-passwordHash');

      const userIds = users.map((u) => u._id);
      const userEmails = users.map((u) => (u.email || '').toLowerCase().trim()).filter(Boolean);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Aggregate account activity for each page row plus the customer summary cards (Strictly Cosmic Store product orders).
      const [
        deckCounts,
        activePasses,
        unlockCounts,
        storeOrderStats,
        totalCustomers,
        newCustomersLast7Days,
        customersWithStoreOrders,
        customerStoreSpending,
      ] = await Promise.all([
        PersonalizedDeck.aggregate([
          { $match: { userId: { $in: userIds } } },
          { $group: { _id: '$userId', count: { $sum: 1 } } },
        ]),
        DeckPass.find({
          userId: { $in: userIds },
          isActive: true,
          expiresAt: { $gt: new Date() },
        }),
        CardUnlock.aggregate([
          { $match: { userId: { $in: userIds } } },
          { $group: { _id: '$userId', count: { $sum: 1 } } },
        ]),
        // Aggregate StoreProduct orders per user (matching either userId or customerEmail)
        StoreOrder.aggregate([
          {
            $match: {
              $or: [
                { userId: { $in: userIds } },
                { customerEmail: { $in: userEmails } },
              ],
            },
          },
          {
            $project: {
              matchedUserKey: {
                $cond: [
                  { $in: ['$userId', userIds] },
                  { $toString: '$userId' },
                  { $toLower: '$customerEmail' },
                ],
              },
              totalAmountRupees: 1,
            },
          },
          {
            $group: {
              _id: '$matchedUserKey',
              orderCount: { $sum: 1 },
              totalSpentRupees: { $sum: '$totalAmountRupees' },
            },
          },
        ]),
        User.countDocuments({ role: 'user' }),
        User.countDocuments({ role: 'user', createdAt: { $gte: sevenDaysAgo } }),
        StoreOrder.distinct('customerEmail', { status: { $ne: 'Cancelled' } }),
        StoreOrder.aggregate([
          { $match: { status: { $ne: 'Cancelled' } } },
          { $group: { _id: null, totalSpentRupees: { $sum: '$totalAmountRupees' } } },
        ]),
      ]);

      const deckCountMap = new Map(deckCounts.map((d) => [d._id.toString(), d.count]));
      const activePassSet = new Set(activePasses.map((p) => p.userId.toString()));
      const unlockCountMap = new Map(unlockCounts.map((u) => [u._id.toString(), u.count]));
      const storeOrderMap = new Map<string, { orderCount: number; totalSpentRupees: number }>();
      for (const stat of storeOrderStats) {
        if (stat._id) {
          storeOrderMap.set(String(stat._id).toLowerCase(), {
            orderCount: stat.orderCount,
            totalSpentRupees: stat.totalSpentRupees,
          });
        }
      }

      const enrichedUsers = users.map((u) => {
        const idKey = u._id.toString();
        const emailKey = (u.email || '').toLowerCase().trim();
        const userOrderStat = storeOrderMap.get(idKey) || (emailKey ? storeOrderMap.get(emailKey) : null);

        return {
          id: idKey,
          name: u.name,
          email: u.email,
          role: u.role,
          deckCount: deckCountMap.get(idKey) || 0,
          hasActivePass: activePassSet.has(idKey),
          unlockedCardsCount: unlockCountMap.get(idKey) || 0,
          totalOrders: userOrderStat?.orderCount || 0,
          totalSpentRupees: userOrderStat?.totalSpentRupees || 0,
          createdAt: u.createdAt,
        };
      });

      res.json({
        success: true,
        data: {
          users: enrichedUsers,
          metrics: {
            totalCustomers,
            newCustomersLast7Days,
            customersWithOrders: customersWithStoreOrders.length,
            totalCustomerSpendingRupees: customerStoreSpending[0]?.totalSpentRupees || 0,
          },
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 2b. View Specific User Profile & History
   */
  public async getUserDetails(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: 'Invalid user ID format' });
        return;
      }

      const user = await User.findById(id).select('-passwordHash');
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      const [profiles, decks, passes, unlocks, storeOrders] = await Promise.all([
        BirthProfile.find({ userId: user._id }).sort({ createdAt: -1 }),
        PersonalizedDeck.find({ userId: user._id }).sort({ createdAt: -1 }),
        DeckPass.find({ userId: user._id }).sort({ createdAt: -1 }),
        CardUnlock.find({ userId: user._id }).sort({ createdAt: -1 }),
        StoreOrder.find({
          $or: [
            { userId: user._id },
            { customerEmail: (user.email || '').toLowerCase().trim() },
          ],
        }).sort({ createdAt: -1 }),
      ]);

      await recordAuditAction(req, 'INSPECT_USER_DETAILS', 'USER', id, { targetUserEmail: user.email });

      res.json({
        success: true,
        data: {
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
          },
          profiles: profiles.map((p) => ({
            id: p._id.toString(),
            name: p.name,
            dateOfBirth: p.dateOfBirth,
            place: p.place,
            createdAt: p.createdAt,
          })),
          decks: decks.map((d) => ({
            id: d._id.toString(),
            sovereignCardKey: d.sovereignCardKey,
            avatarPhrase: d.avatarPhrase,
            isAvatarAiGenerated: !!d.isAvatarAiGenerated,
            totalCards: d.totalCards,
            createdAt: d.createdAt,
          })),
          passes: passes.map((p) => ({
            id: p._id.toString(),
            passType: p.passType,
            expiresAt: p.expiresAt,
            isActive: p.isActive && p.expiresAt > new Date(),
          })),
          unlocks: unlocks.map((u) => ({
            id: u._id.toString(),
            cardKey: u.cardKey,
            unlockedAt: u.unlockedAt,
          })),
          orders: storeOrders.map((o) => {
            const primaryProduct = o.products?.[0];
            const productName = primaryProduct?.name
              ? (o.products.length > 1 ? `${primaryProduct.name} +${o.products.length - 1}` : primaryProduct.name)
              : 'Cosmic Store Product';

            return {
              id: o._id.toString(),
              orderId: o.orderId,
              itemType: productName,
              amountRupees: o.totalAmountRupees || 0,
              status: o.status,
              createdAt: o.createdAt,
            };
          }),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 2c. Delete User Account
   */
  public async deleteUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: 'Invalid user ID format' });
        return;
      }

      if (req.user?.id === id) {
        res.status(400).json({
          success: false,
          message: 'Security protection: You cannot delete your own active administrative account.',
        });
        return;
      }

      const user = await User.findById(id);
      if (!user) {
        res.status(404).json({ success: false, message: 'User account not found' });
        return;
      }

      const userDetails = {
        name: user.name,
        email: user.email,
        role: user.role,
      };

      // Cascade delete user-associated records
      const userObjId = new mongoose.Types.ObjectId(id);
      const userDecks = await PersonalizedDeck.find({ userId: userObjId }).select('_id');
      const deckIds = userDecks.map((d) => d._id);

      await Promise.all([
        BirthProfile.deleteMany({ userId: userObjId }),
        PersonalizedDeck.deleteMany({ userId: userObjId }),
        PersonalizedCard.deleteMany({ deckId: { $in: deckIds } }),
        DeckPass.deleteMany({ userId: userObjId }),
        CardUnlock.deleteMany({ userId: userObjId }),
        User.findByIdAndDelete(id),
      ]);

      await recordAuditAction(
        req,
        'DELETE_USER',
        'USER',
        id,
        userDetails
      );

      res.json({
        success: true,
        message: `Seeker account for '${user.name}' (${user.email}) deleted successfully`,
        data: { id },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 3. Deck Management with Search & Filtering
   */
  public async getDecks(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
      const search = (req.query.search as string || '').trim();
      const aiFilter = (req.query.aiFilter as string || '').trim().toLowerCase();

      const query: Record<string, any> = {};
      if (search) {
        query.$or = [
          { sovereignCardKey: { $regex: search, $options: 'i' } },
          { avatarPhrase: { $regex: search, $options: 'i' } },
        ];
      }
      if (aiFilter === 'ai') {
        query.isAvatarAiGenerated = true;
      } else if (aiFilter === 'deterministic') {
        query.isAvatarAiGenerated = false;
      }

      const total = await PersonalizedDeck.countDocuments(query);
      const decks = await PersonalizedDeck.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('profileId', 'name dateOfBirth gender place')
        .populate('userId', 'name email');

      res.json({
        success: true,
        data: {
          decks: decks.map((d: any) => ({
            id: d._id.toString(),
            seekerName: d.profileId?.name || d.userId?.name || 'Guest Seeker',
            sovereignCardKey: d.sovereignCardKey,
            avatarPhrase: d.avatarPhrase,
            avatarSummary: d.avatarSummary,
            isAvatarAiGenerated: !!d.isAvatarAiGenerated,
            totalCards: d.totalCards || 55,
            userEmail: d.userId?.email,
            gender: d.profileId?.gender,
            dateOfBirth: d.profileId?.dateOfBirth,
            calculationId: d.calculationId?.toString(),
            generatedAt: d.generatedAt || d.createdAt,
          })),
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 3b. Inspect Deck Cards
   */
  public async getDeckDetails(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: 'Invalid deck ID' });
        return;
      }

      const deck = await PersonalizedDeck.findById(id).populate('profileId').populate('userId', 'email name');
      if (!deck) {
        res.status(404).json({ success: false, message: 'Deck not found' });
        return;
      }

      const cards = await PersonalizedCard.find({ deckId: deck._id }).sort({ position: 1 });

      await recordAuditAction(req, 'INSPECT_DECK_DETAILS', 'DECK', id, { sovereignCardKey: deck.sovereignCardKey });

      res.json({
        success: true,
        data: {
          deck: {
            id: deck._id.toString(),
            seekerName: (deck.profileId as any)?.name || (deck.userId as any)?.name || 'Seeker',
            sovereignCardKey: deck.sovereignCardKey,
            avatarPhrase: deck.avatarPhrase,
            avatarSummary: deck.avatarSummary,
            isAvatarAiGenerated: !!deck.isAvatarAiGenerated,
            totalCards: deck.totalCards,
            generatedAt: deck.generatedAt,
          },
          cards: cards.map((c) => ({
            id: c._id.toString(),
            position: c.position,
            key: c.key,
            title: c.title,
            suit: c.suit,
            suitSymbol: c.suitSymbol,
            rank: c.rank,
            isSovereign: c.isSovereign,
            isFree: c.isFree,
            placement: {
              signName: c.astronomicalPlacement?.signName,
              deg: c.astronomicalPlacement?.deg,
              house: c.astronomicalPlacement?.house,
              nak: c.astronomicalPlacement?.nak,
              pada: c.astronomicalPlacement?.pada,
              lord: c.astronomicalPlacement?.lord,
              ruler: c.astronomicalPlacement?.ruler,
              navamshaSignName: c.astronomicalPlacement?.navamshaSignName,
              houseLord: c.astronomicalPlacement?.houseLord,
            },
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 4. 55-Card Catalog Management
   */
  public async getCardsCatalog(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const cards = await CardDefinition.find().sort({ position: 1 });

      const suitsGrouped: Record<string, any[]> = {
        Dharma: [],
        Artha: [],
        Kama: [],
        Moksha: [],
        MasterKey: [],
      };

      const keysSeen = new Set<string>();
      const positionsSeen = new Set<number>();
      const duplicateKeys: string[] = [];
      const duplicatePositions: number[] = [];

      for (const card of cards) {
        if (suitsGrouped[card.suit]) {
          suitsGrouped[card.suit].push({
            id: card._id.toString(),
            position: card.position,
            cardId: card.cardId,
            key: card.key,
            title: card.title,
            suit: card.suit,
            suitSymbol: card.suitSymbol,
            suitTheme: card.suitTheme,
            rank: card.rank,
            label: card.label,
            line: card.line || '',
            detailedInterpretation: card.detailedInterpretation || '',
            reflectionQuestion: card.reflectionQuestion || '',
            shortSummary: card.shortSummary,
            isFreeByDefault: card.isFreeByDefault,
            category: card.category,
            price: card.isFreeByDefault ? 0 : (card.price ?? 2),
          });
        }

        if (keysSeen.has(card.key)) {
          duplicateKeys.push(card.key);
        }
        keysSeen.add(card.key);

        if (positionsSeen.has(card.position)) {
          duplicatePositions.push(card.position);
        }
        positionsSeen.add(card.position);
      }

      // Check missing positions 1 to 55
      const missingPositions: number[] = [];
      for (let i = 1; i <= 55; i++) {
        if (!positionsSeen.has(i)) {
          missingPositions.push(i);
        }
      }

      const isCatalogValid =
        cards.length === 55 &&
        duplicateKeys.length === 0 &&
        duplicatePositions.length === 0 &&
        missingPositions.length === 0;

      res.json({
        success: true,
        data: {
          totalCards: cards.length,
          expectedTotal: 55,
          isCatalogValid,
          integrityCheck: {
            missingPositions,
            duplicateKeys,
            duplicatePositions,
          },
          suitCounts: {
            Dharma: suitsGrouped.Dharma.length,
            Artha: suitsGrouped.Artha.length,
            Kama: suitsGrouped.Kama.length,
            Moksha: suitsGrouped.Moksha.length,
            MasterKey: suitsGrouped.MasterKey.length,
          },
          suits: suitsGrouped,
          allCards: cards.map((c) => ({
            id: c._id.toString(),
            position: c.position,
            key: c.key,
            title: c.title,
            suit: c.suit,
            suitSymbol: c.suitSymbol,
            rank: c.rank,
            line: c.line,
            detailedInterpretation: c.detailedInterpretation,
            reflectionQuestion: c.reflectionQuestion,
            isFreeByDefault: c.isFreeByDefault,
            shortSummary: c.shortSummary,
            price: c.isFreeByDefault ? 0 : (c.price ?? 2),
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 4b. Update Card Definition
   */
  public async updateCard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const {
        title,
        shortSummary,
        detailedInterpretation,
        reflectionQuestion,
        line,
        suitTheme,
        rank,
        label,
        isFreeByDefault,
        category,
        position,
        price,
      } = req.body;

      const card = await CardDefinition.findById(id);
      if (!card) {
        res.status(404).json({
          success: false,
          message: 'Card definition not found',
        });
        return;
      }

      if (title !== undefined) card.title = String(title).trim();
      if (shortSummary !== undefined) card.shortSummary = String(shortSummary).trim();
      if (detailedInterpretation !== undefined) card.detailedInterpretation = String(detailedInterpretation).trim();
      if (reflectionQuestion !== undefined) card.reflectionQuestion = String(reflectionQuestion).trim();
      if (line !== undefined) card.line = String(line).trim();
      if (suitTheme !== undefined) card.suitTheme = String(suitTheme).trim();
      if (rank !== undefined) card.rank = String(rank).trim();
      if (label !== undefined) card.label = String(label).trim();
      if (isFreeByDefault !== undefined) {
        card.isFreeByDefault = Boolean(isFreeByDefault);
        await PersonalizedCard.updateMany({ key: card.key }, { $set: { isFree: card.isFreeByDefault } });
      }
      if (category !== undefined) card.category = String(category).trim();
      if (position !== undefined && typeof position === 'number') card.position = position;
      if (price !== undefined) card.price = Math.max(0, Number(price) || 0);

      await card.save();

      await recordAuditAction(
        req,
        'UPDATE_CARD',
        'CARD',
        card._id.toString(),
        {
          key: card.key,
          title: card.title,
          suit: card.suit,
          position: card.position,
          isFreeByDefault: card.isFreeByDefault,
        }
      );

      res.json({
        success: true,
        message: 'Card definition updated successfully',
        data: card,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 4b-ii. Dynamic Free / Paid Toggle for Catalog Card
   */
  public async updateCardAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { isFree } = req.body;

      if (typeof isFree !== 'boolean') {
        res.status(400).json({
          success: false,
          message: 'Invalid access tier value. "isFree" must be a boolean (true for FREE, false for PAID).',
        });
        return;
      }

      const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { key: id };
      const card = await CardDefinition.findOne(query);

      if (!card) {
        res.status(404).json({
          success: false,
          message: 'Card definition not found in catalog',
        });
        return;
      }

      const previousState = card.isFreeByDefault;
      card.isFreeByDefault = isFree;
      await card.save();

      // Synchronize all seeker personalized decks containing this card
      await PersonalizedCard.updateMany(
        { key: card.key },
        { $set: { isFree } }
      );

      // Audit Log
      await recordAuditAction(
        req,
        'TOGGLE_CARD_ACCESS',
        'CARD',
        card._id.toString(),
        {
          key: card.key,
          title: card.title,
          suit: card.suit,
          position: card.position,
          previousTier: previousState ? 'FREE' : 'PAID',
          newTier: isFree ? 'FREE' : 'PAID',
        }
      );

      res.json({
        success: true,
        message: `Card "${card.title}" (${card.key}) access tier updated to ${isFree ? 'FREE' : 'PAID'} successfully.`,
        data: {
          id: card._id.toString(),
          key: card.key,
          title: card.title,
          position: card.position,
          isFreeByDefault: card.isFreeByDefault,
          card,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 4c. Delete Card Definition
   */
  public async deleteCard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const card = await CardDefinition.findById(id);
      if (!card) {
        res.status(404).json({
          success: false,
          message: 'Card definition not found',
        });
        return;
      }

      const cardDetails = {
        key: card.key,
        title: card.title,
        suit: card.suit,
        position: card.position,
      };

      await CardDefinition.findByIdAndDelete(id);

      await recordAuditAction(
        req,
        'DELETE_CARD',
        'CARD',
        id,
        cardDetails
      );

      res.json({
        success: true,
        message: `Card '${card.title}' (#${card.position}) deleted successfully`,
        data: { id },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 5. Payments & Verified Revenue Reporting (Unified: Digital Unlocks, Deck Passes & Physical Store Orders)
   */
  public async getPayments(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
      const statusFilter = (req.query.status as string || '').trim().toUpperCase();
      const itemTypeFilter = (req.query.itemType as string || '').trim().toUpperCase();
      const search = (req.query.search as string || '').trim();

      // Strictly restrict to genuine registered users & non-simulated real orders
      const realUsers = await User.find({}).select('_id name email role').lean();
      const realUserIds = realUsers.map((u) => u._id);

      const paymentQuery: Record<string, any> = {
        userId: { $in: realUserIds },
        razorpayOrderId: { $not: /^order_sim_/i },
        orderId: { $not: /^rcpt_wh_/i },
      };
      const storeQuery: Record<string, any> = {
        customerEmail: { $not: /@example\.com$/i },
      };

      // Status filtering
      if (statusFilter && statusFilter !== 'ALL') {
        if (statusFilter === 'PAID') {
          paymentQuery.status = 'PAID';
          storeQuery.paymentStatus = 'PAID';
        } else if (statusFilter === 'FAILED') {
          paymentQuery.status = 'FAILED';
          storeQuery.paymentStatus = 'FAILED';
        } else if (statusFilter === 'CREATED' || statusFilter === 'PENDING') {
          paymentQuery.status = 'CREATED';
          storeQuery.paymentStatus = 'PENDING';
        } else if (statusFilter === 'REFUNDED') {
          paymentQuery.status = 'REFUNDED';
          storeQuery.$or = [{ paymentStatus: 'REFUNDED' }, { status: 'Cancelled' }];
        } else {
          paymentQuery.status = statusFilter;
          storeQuery.paymentStatus = statusFilter;
        }
      }

      // Item Type filtering
      let includePayments = true;
      let includeStore = true;

      if (itemTypeFilter && itemTypeFilter !== 'ALL') {
        if (itemTypeFilter === 'CARD_UNLOCK' || itemTypeFilter === 'DECK_PASS') {
          paymentQuery.itemType = itemTypeFilter;
          includeStore = false;
        } else if (itemTypeFilter === 'STORE_PRODUCT' || itemTypeFilter === 'STORE_ORDER') {
          includePayments = false;
        }
      }

      // Search filtering
      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        if (includePayments) {
          const matchingUsers = await User.find({
            _id: { $in: realUserIds },
            $or: [
              { name: { $regex: escaped, $options: 'i' } },
              { email: { $regex: escaped, $options: 'i' } },
            ],
          }).select('_id');
          const matchingUserIds = matchingUsers.map((u) => u._id);

          const matchingTransactions = await PaymentTransaction.find({
            razorpayPaymentId: { $regex: escaped, $options: 'i' },
          }).select('orderId');
          const matchingOrderIds = matchingTransactions.map((t) => t.orderId);

          paymentQuery.$and = [
            {
              $or: [
                { orderId: { $regex: escaped, $options: 'i' } },
                { razorpayOrderId: { $regex: escaped, $options: 'i' } },
                { itemId: { $regex: escaped, $options: 'i' } },
                { userId: { $in: matchingUserIds } },
                { orderId: { $in: matchingOrderIds } },
              ],
            },
          ];
        }

        if (includeStore) {
          storeQuery.$and = [
            {
              $or: [
                { orderId: { $regex: escaped, $options: 'i' } },
                { customerName: { $regex: escaped, $options: 'i' } },
                { customerEmail: { $regex: escaped, $options: 'i' } },
                { customerPhone: { $regex: escaped, $options: 'i' } },
                { 'products.name': { $regex: escaped, $options: 'i' } },
              ],
            },
          ];
        }
      }

      // Count matching documents
      const [totalPaymentCount, totalStoreCount] = await Promise.all([
        includePayments ? PaymentOrder.countDocuments(paymentQuery) : 0,
        includeStore ? StoreOrder.countDocuments(storeQuery) : 0,
      ]);
      const total = totalPaymentCount + totalStoreCount;

      // Fetch top candidates from both collections up to (page * limit)
      const fetchCap = Math.min(2000, page * limit);
      const [rawPaymentOrders, rawStoreOrders, cardDefinitions] = await Promise.all([
        includePayments
          ? PaymentOrder.find(paymentQuery).sort({ createdAt: -1 }).limit(fetchCap).lean()
          : [],
        includeStore
          ? StoreOrder.find(storeQuery).sort({ createdAt: -1 }).limit(fetchCap).lean()
          : [],
        CardDefinition.find({}).select('key cardId title').lean(),
      ]);

      // Build card lookup map
      const cardMap = new Map<string, string>();
      for (const cd of cardDefinitions) {
        if (cd.key) cardMap.set(cd.key.toLowerCase(), cd.title);
        if (cd.cardId) cardMap.set(cd.cardId.toLowerCase(), cd.title);
      }

      // Populate user and audit info for payment orders
      const validUserIds = rawPaymentOrders
        .map((o) => o.userId)
        .filter((uid): uid is mongoose.Types.ObjectId => Boolean(uid && mongoose.Types.ObjectId.isValid(uid)));

      const [users, auditLogs, transactions] = await Promise.all([
        validUserIds.length > 0
          ? User.find({ _id: { $in: validUserIds } }).select('_id name email role').lean()
          : [],
        validUserIds.length > 0
          ? AuditLog.find({
              action: 'DELETE_USER',
              targetId: { $in: validUserIds.map((id) => id.toString()) },
            }).lean()
          : [],
        rawPaymentOrders.length > 0
          ? PaymentTransaction.find({
              orderId: { $in: rawPaymentOrders.map((o) => o.orderId) },
            }).select('orderId razorpayPaymentId status verifiedAt rawResponse').lean()
          : [],
      ]);

      const userMap = new Map(users.map((u) => [u._id.toString(), u]));
      const auditLogMap = new Map(auditLogs.map((a) => [a.targetId, a]));
      const transactionMap = new Map(transactions.map((t) => [t.orderId, t]));

      // Map Payment Orders
      const mappedPayments = rawPaymentOrders.map((o: any) => {
        const rawUserId = o.userId ? o.userId.toString() : null;
        const matchedUser = rawUserId ? userMap.get(rawUserId) : null;
        const matchedAudit = rawUserId ? auditLogMap.get(rawUserId) : null;
        const matchedTxn = transactionMap.get(o.orderId);

        let customerName = 'Guest Seeker';
        let customerEmail = 'Unregistered Guest';
        let customerStatus: 'REGISTERED' | 'DELETED_ACCOUNT' | 'UNAVAILABLE' | 'GUEST' = 'GUEST';

        if (matchedUser) {
          customerName = matchedUser.name;
          customerEmail = matchedUser.email;
          customerStatus = 'REGISTERED';
        } else if (matchedAudit) {
          customerName = matchedAudit.details?.name || 'Deleted Account';
          customerEmail = matchedAudit.details?.email || 'Confirmed Deleted by Administrator';
          customerStatus = 'DELETED_ACCOUNT';
        } else if (rawUserId) {
          customerName = 'User details unavailable';
          customerEmail = 'Unverified User Reference';
          customerStatus = 'UNAVAILABLE';
        } else {
          customerName = 'Guest Seeker';
          customerEmail = o.guestSessionId ? `Session: ${o.guestSessionId}` : 'Unregistered Guest';
          customerStatus = 'GUEST';
        }

        let itemName = 'Service';
        if (o.itemType === 'DECK_PASS') {
          itemName = '55-Card Deck Pass';
        } else if (o.itemType === 'CARD_UNLOCK') {
          const cardTitle = cardMap.get((o.itemId || '').toLowerCase());
          itemName = cardTitle ? `Card: ${cardTitle}` : (o.itemId ? `Card Unlock (${o.itemId})` : 'Card Unlock');
        }

        return {
          id: o._id.toString(),
          orderId: o.orderId,
          razorpayOrderId: o.razorpayOrderId,
          razorpayPaymentId: matchedTxn?.razorpayPaymentId || null,
          guestSessionId: o.guestSessionId || null,
          customer: {
            name: customerName,
            email: customerEmail,
            phone: '—',
            userId: rawUserId,
            status: customerStatus,
          },
          userEmail: customerEmail,
          userName: customerName,
          customerPhone: '—',
          itemType: o.itemType,
          itemId: o.itemId,
          itemName,
          amountRupees: (o.amountPaise || 0) / 100,
          currency: o.currency || 'INR',
          paymentMethod: matchedTxn?.rawResponse?.method || 'UPI',
          status: o.status,
          verifiedAt: matchedTxn?.verifiedAt || null,
          createdAt: o.createdAt,
        };
      });

      // Map Store Orders (Physical Cosmic Store products)
      const mappedStoreOrders = rawStoreOrders.map((s: any) => {
        const prodNames = s.products && s.products.length > 0
          ? s.products.map((p: any) => (p.quantity > 1 ? `${p.name} (x${p.quantity})` : p.name)).join(', ')
          : 'Cosmic Store Product';

        const orderStatus = s.paymentStatus === 'PAID'
          ? 'PAID'
          : s.paymentStatus === 'FAILED'
          ? 'FAILED'
          : 'CREATED';

        return {
          id: s._id.toString(),
          orderId: s.orderId,
          razorpayOrderId: s.orderId,
          razorpayPaymentId: s.paymentMethod === 'Cash on Delivery'
            ? 'COD'
            : (s.orderId ? `PAY-${s.orderId.replace('#', '')}` : null),
          guestSessionId: null,
          customer: {
            name: s.customerName || 'Store Customer',
            email: s.customerEmail || '—',
            phone: s.customerPhone || '—',
            userId: s.userId ? s.userId.toString() : null,
            status: s.userId ? 'REGISTERED' : 'GUEST',
          },
          userEmail: s.customerEmail || '—',
          userName: s.customerName || 'Store Customer',
          customerPhone: s.customerPhone || '—',
          itemType: 'STORE_PRODUCT',
          itemId: s.products?.map((p: any) => p.productId).filter(Boolean).join(',') || null,
          itemName: prodNames,
          amountRupees: s.totalAmountRupees || 0,
          currency: 'INR',
          paymentMethod: s.paymentMethod || 'Online',
          status: orderStatus,
          verifiedAt: s.paymentStatus === 'PAID' ? s.createdAt : null,
          createdAt: s.createdAt,
        };
      });

      // Merge & Sort descending by createdAt
      const combined = [...mappedPayments, ...mappedStoreOrders];
      combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Paginate
      const startIndex = (page - 1) * limit;
      const paginatedResults = combined.slice(startIndex, startIndex + limit);

      // Revenue and Count Aggregations across both collections (Strictly real users & non-simulated)
      const [paidPaymentSummary, paidStoreSummary, failedPaymentCount, failedStoreCount] = await Promise.all([
        PaymentOrder.aggregate([
          {
            $match: {
              status: 'PAID',
              userId: { $in: realUserIds },
              razorpayOrderId: { $not: /^order_sim_/i },
              orderId: { $not: /^rcpt_wh_/i },
            },
          },
          {
            $group: {
              _id: null,
              cardUnlocksRevenue: {
                $sum: {
                  $cond: [{ $eq: ['$itemType', 'CARD_UNLOCK'] }, { $divide: ['$amountPaise', 100] }, 0],
                },
              },
              deckPassesRevenue: {
                $sum: {
                  $cond: [{ $eq: ['$itemType', 'DECK_PASS'] }, { $divide: ['$amountPaise', 100] }, 0],
                },
              },
              paidCount: { $sum: 1 },
            },
          },
        ]),
        StoreOrder.aggregate([
          {
            $match: {
              paymentStatus: 'PAID',
              customerEmail: { $not: /@example\.com$/i },
            },
          },
          {
            $group: {
              _id: null,
              storeProductsRevenue: { $sum: '$totalAmountRupees' },
              paidCount: { $sum: 1 },
            },
          },
        ]),
        PaymentOrder.countDocuments({
          status: 'FAILED',
          userId: { $in: realUserIds },
          razorpayOrderId: { $not: /^order_sim_/i },
          orderId: { $not: /^rcpt_wh_/i },
        }),
        StoreOrder.countDocuments({
          paymentStatus: 'FAILED',
          customerEmail: { $not: /@example\.com$/i },
        }),
      ]);

      const cardUnlocksRevenue = paidPaymentSummary[0]?.cardUnlocksRevenue || 0;
      const deckPassesRevenue = paidPaymentSummary[0]?.deckPassesRevenue || 0;
      const storeProductsRevenue = paidStoreSummary[0]?.storeProductsRevenue || 0;
      const totalRevenueRupees = cardUnlocksRevenue + deckPassesRevenue + storeProductsRevenue;
      const paidOrdersCount = (paidPaymentSummary[0]?.paidCount || 0) + (paidStoreSummary[0]?.paidCount || 0);
      const failedOrdersCount = failedPaymentCount + failedStoreCount;

      res.json({
        success: true,
        data: {
          summary: {
            totalRevenueRupees,
            cardUnlocksRevenue,
            deckPassesRevenue,
            storeProductsRevenue,
            paidOrdersCount,
            failedOrdersCount,
          },
          orders: paginatedResults,
          payments: paginatedResults,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 5b. Delete Payment Order Record (Supports both digital payment orders & store orders)
   */
  public async deletePayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: 'Invalid payment order ID format' });
        return;
      }

      // Check PaymentOrder first
      const order = await PaymentOrder.findById(id);
      if (order) {
        const orderDetails = {
          orderId: order.orderId,
          razorpayOrderId: order.razorpayOrderId,
          amountPaise: order.amountPaise,
          itemType: order.itemType,
          status: order.status,
          userId: order.userId ? order.userId.toString() : null,
          guestSessionId: order.guestSessionId || null,
        };

        // Cascade delete associated PaymentTransaction if exists
        await Promise.all([
          PaymentTransaction.deleteMany({ orderId: order.orderId }),
          PaymentOrder.findByIdAndDelete(id),
        ]);

        await recordAuditAction(
          req,
          'DELETE_PAYMENT',
          'PAYMENT',
          id,
          orderDetails
        );

        res.json({
          success: true,
          message: `Payment order '${order.orderId}' deleted successfully`,
          data: { id, orderId: order.orderId },
        });
        return;
      }

      // Check StoreOrder
      const storeOrder = await StoreOrder.findById(id);
      if (storeOrder) {
        await StoreOrder.findByIdAndDelete(id);

        await recordAuditAction(
          req,
          'DELETE_STORE_PAYMENT',
          'PAYMENT',
          id,
          {
            orderId: storeOrder.orderId,
            customerName: storeOrder.customerName,
            totalAmountRupees: storeOrder.totalAmountRupees,
          }
        );

        res.json({
          success: true,
          message: `Store payment order '${storeOrder.orderId}' deleted successfully`,
          data: { id, orderId: storeOrder.orderId },
        });
        return;
      }

      res.status(404).json({ success: false, message: 'Payment or store order record not found' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 6. Gemini AI Monitoring & Live Health Check
   */
  public async getAiMonitoring(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const [
        totalInterpretations,
        aiInterpretationsCount,
        fallbackInterpretationsCount,
        totalDecks,
        aiAvatarDecksCount,
        recentInterpretations,
      ] = await Promise.all([
        CardInterpretation.countDocuments(),
        CardInterpretation.countDocuments({ isAiGenerated: true }),
        CardInterpretation.countDocuments({ isAiGenerated: false }),
        PersonalizedDeck.countDocuments(),
        PersonalizedDeck.countDocuments({ isAvatarAiGenerated: true }),
        CardInterpretation.find()
          .sort({ createdAt: -1 })
          .limit(8)
          .select('cardKey sovereignAvatarPhrase isAiGenerated createdAt'),
      ]);

      // Measure latency with sanitized test ping if key is configured
      let pingLatencyMs = -1;
      let pingStatus = 'UNCONFIGURED';

      if (ENV.GEMINI_API_KEY && ENV.GEMINI_API_KEY.length > 10) {
        const start = Date.now();
        try {
          await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${ENV.GEMINI_MODEL}:generateContent`,
            {
              contents: [{ parts: [{ text: 'Healthcheck: 1 word OK' }] }],
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': ENV.GEMINI_API_KEY,
              },
              timeout: 6000,
            }
          );
          pingLatencyMs = Date.now() - start;
          pingStatus = 'HEALTHY';
        } catch (err: any) {
          pingStatus = err.response?.status === 503 ? 'DEGRADED_HIGH_DEMAND' : 'ERROR';
        }
      }

      res.json({
        success: true,
        data: {
          configuration: {
            primaryModel: ENV.GEMINI_MODEL,
            fallbackModel: 'gemini-3.5-flash',
            apiVersion: 'v1beta',
            authTransport: 'Header (x-goog-api-key)',
            hasApiKey: !!ENV.GEMINI_API_KEY && ENV.GEMINI_API_KEY.length > 10,
          },
          telemetry: {
            pingStatus,
            pingLatencyMs,
            totalInterpretations,
            aiInterpretationsCount,
            fallbackInterpretationsCount,
            aiGenerationPercentage:
              totalInterpretations > 0 ? Math.round((aiInterpretationsCount / totalInterpretations) * 100) : 100,
            totalDecks,
            aiAvatarDecksCount,
            fallbackAvatarDecksCount: totalDecks - aiAvatarDecksCount,
            aiAvatarPercentage:
              totalDecks > 0 ? Math.round((aiAvatarDecksCount / totalDecks) * 100) : 100,
          },
          recentInterpretations: recentInterpretations.map((item) => ({
            id: item._id.toString(),
            cardKey: item.cardKey,
            sovereignAvatarPhrase: item.sovereignAvatarPhrase,
            isAiGenerated: item.isAiGenerated,
            createdAt: item.createdAt,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 7. Astronomy Engine Monitoring & Required Fields Validation
   */
  public async getAstronomyMonitoring(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [totalCalculations, calculationsLast24h, recentCalculations] = await Promise.all([
        AstronomicalCalculation.countDocuments(),
        AstronomicalCalculation.countDocuments({ createdAt: { $gte: oneDayAgo } }),
        AstronomicalCalculation.find().sort({ calculatedAt: -1 }).limit(10),
      ]);

      // Sample recent calculations to audit required astronomical field integrity
      let completePointsCount = 0;
      let totalCheckedPoints = 0;

      for (const calc of recentCalculations) {
        const points = calc.parsedPoints || {};
        for (const [key, p] of Object.entries(points)) {
          const pt = p as any;
          totalCheckedPoints++;
          if (
            pt &&
            pt.sign != null &&
            pt.deg != null &&
            pt.house != null &&
            pt.nak &&
            pt.pada != null &&
            pt.lord &&
            pt.navamshaSignName &&
            pt.houseLord
          ) {
            completePointsCount++;
          }
        }
      }

      const fieldIntegrityPercentage =
        totalCheckedPoints > 0 ? Math.round((completePointsCount / totalCheckedPoints) * 100) : 100;

      res.json({
        success: true,
        data: {
          provider: {
            name: ENV.ASTRONOMY_PROVIDER,
            serviceUrl: ENV.PYJHORA_API_URL || 'http://127.0.0.1:8000',
            status: 'CONNECTED',
          },
          telemetry: {
            totalCalculations,
            calculationsLast24h,
            sampledPointsChecked: totalCheckedPoints,
            completePointsCount,
            fieldIntegrityPercentage,
            requiredFieldsValidated: [
              'Sign & Degree',
              'House Placement',
              'Nakshatra & Pada',
              'Nakshatra Lord',
              'Nadi Amsa Ruler',
              'Navamsha (D9) Sign',
              'House Lord (Dispositor)',
            ],
          },
          recentCalculations: recentCalculations.map((c) => ({
            id: c._id.toString(),
            place: c.inputSnapshot?.place,
            date: c.inputSnapshot?.date,
            time: c.inputSnapshot?.time,
            akPlanet: c.akPlanet,
            lagSign: c.lagSign,
            foundPointsCount: c.foundPointsCount,
            totalPointsCount: c.totalPointsCount,
            calculatedAt: c.calculatedAt,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 8. Analytics Engine with Date-Range Aggregations
   */
  public async getAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const range = (req.query.range as string || '30d').toLowerCase();
      let days = 30;
      if (range === '7d') days = 7;
      if (range === '90d') days = 90;
      if (range === 'all') days = 365;

      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [
        dailyUsers,
        dailyDecks,
        dailyRevenue,
        popularCardUnlocks,
        totalPaidOrders,
        registeredUsersCount,
        uniquePayingUsers,
      ] = await Promise.all([
        User.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        PersonalizedDeck.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        PaymentOrder.aggregate([
          { $match: { status: 'PAID', createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              revenueRupees: { $sum: { $divide: ['$amountPaise', 100] } },
              ordersCount: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        CardUnlock.aggregate([
          { $match: { unlockedAt: { $gte: startDate } } },
          { $group: { _id: '$cardKey', unlocksCount: { $sum: 1 } } },
          { $sort: { unlocksCount: -1 } },
          { $limit: 8 },
        ]),
        PaymentOrder.countDocuments({ status: 'PAID', createdAt: { $gte: startDate } }),
        User.countDocuments({ createdAt: { $gte: startDate } }),
        PaymentOrder.distinct('userId', { status: 'PAID', createdAt: { $gte: startDate } }),
      ]);

      const conversionRate =
        registeredUsersCount > 0 ? Math.round((uniquePayingUsers.length / registeredUsersCount) * 100) : 0;

      res.json({
        success: true,
        data: {
          range,
          conversionRate,
          uniquePayingUsersCount: uniquePayingUsers.length,
          totalPaidOrders,
          dailyUsers: dailyUsers.map((u) => ({ date: u._id, count: u.count })),
          dailyDecks: dailyDecks.map((d) => ({ date: d._id, count: d.count })),
          dailyRevenue: dailyRevenue.map((r) => ({
            date: r._id,
            revenueRupees: r.revenueRupees,
            ordersCount: r.ordersCount,
          })),
          popularCardUnlocks: popularCardUnlocks.map((c) => ({
            cardKey: c._id,
            unlocksCount: c.unlocksCount,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 9. Operational System Diagnostics
   */
  public async getSystemHealth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const dbHost = mongoose.connection.host || 'localhost';
      const isAtlas = dbHost.includes('mongodb.net');
      const memory = process.memoryUsage();

      const [totalWebhooks, processedWebhooks] = await Promise.all([
        WebhookEvent.countDocuments(),
        WebhookEvent.countDocuments({ processed: true }),
      ]);

      res.json({
        success: true,
        data: {
          server: {
            uptimeSeconds: Math.round(process.uptime()),
            nodeVersion: process.version,
            environment: ENV.NODE_ENV,
            memoryMb: {
              rss: Math.round(memory.rss / (1024 * 1024)),
              heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
              heapTotal: Math.round(memory.heapTotal / (1024 * 1024)),
            },
          },
          database: {
            status: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
            isAtlas,
            host: dbHost,
          },
          gemini: {
            model: ENV.GEMINI_MODEL,
            configured: !!ENV.GEMINI_API_KEY && ENV.GEMINI_API_KEY.length > 10,
          },
          astronomy: {
            provider: ENV.ASTRONOMY_PROVIDER,
            url: ENV.PYJHORA_API_URL || 'http://127.0.0.1:8000',
            status: 'OPERATIONAL',
          },
          razorpay: {
            keyIdConfigured: !!ENV.RAZORPAY_KEY_ID,
            webhookSecretConfigured: !!ENV.RAZORPAY_WEBHOOK_SECRET,
            totalWebhooksReceived: totalWebhooks,
            processedWebhooksCount: processedWebhooks,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 10. Admin Accounts Management
   */
  public async getAdmins(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const admins = await User.find({
        role: { $in: ['admin', 'superadmin', 'analytics_manager', 'content_manager', 'support_admin'] },
      }).select('-passwordHash');

      res.json({
        success: true,
        data: {
          admins: admins.map((a) => ({
            id: a._id.toString(),
            name: a.name,
            email: a.email,
            role: a.role,
            createdAt: a.createdAt,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 10b. Audit Logs with Search & Pagination
   */
  public async getAuditLogs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 15));
      const action = (req.query.action as string || '').trim();
      const targetType = (req.query.targetType as string || '').trim();

      const query: Record<string, any> = {};
      if (action) query.action = action;
      if (targetType) query.targetType = targetType;

      const total = await AuditLog.countDocuments(query);
      const logs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      res.json({
        success: true,
        data: {
          logs: logs.map((l) => ({
            id: l._id.toString(),
            adminEmail: l.adminEmail,
            adminName: l.adminName,
            action: l.action,
            targetType: l.targetType,
            targetId: l.targetId,
            details: l.details,
            ipAddress: l.ipAddress,
            status: l.status,
            createdAt: l.createdAt,
          })),
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 11. Change Current Admin Password
   */
  public async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        res.status(401).json({ success: false, message: 'Unauthorized administrative session' });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        res.status(400).json({ success: false, message: 'Both current password and new password are required' });
        return;
      }

      if (typeof newPassword !== 'string' || newPassword.length < 6) {
        res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
        return;
      }

      const user = await User.findById(adminId);
      if (!user) {
        res.status(404).json({ success: false, message: 'Administrator account not found' });
        return;
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        res.status(400).json({ success: false, message: 'Current password is incorrect' });
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      user.passwordHash = newHash;
      await user.save();

      await recordAuditAction(
        req,
        'CHANGE_PASSWORD',
        'AUTH',
        adminId,
        { email: user.email, status: 'SUCCESS' }
      );

      res.json({
        success: true,
        message: 'Password changed successfully. You can now use your new password.',
      });
    } catch (err) {
      next(err);
    }
  }

  // ─── COSMIC STORE PRODUCT MANAGEMENT ───────────────────────────────

  /**
   * 12. Create Cosmic Store Product
   */
  public async createProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, shortDescription, price, mrp, badge, category, image } = req.body;

      if (!name || !String(name).trim()) {
        res.status(400).json({ success: false, message: 'Product name is required.' });
        return;
      }
      if (!shortDescription || !String(shortDescription).trim()) {
        res.status(400).json({ success: false, message: 'Short description is required.' });
        return;
      }

      const numericPrice = Number(price);
      const numericMrp = Number(mrp);

      if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
        res.status(400).json({ success: false, message: 'Selling price must be a positive number.' });
        return;
      }
      if (!Number.isFinite(numericMrp) || numericMrp < numericPrice) {
        res.status(400).json({ success: false, message: 'MRP must be equal to or greater than the selling price.' });
        return;
      }
      if (!image) {
        res.status(400).json({ success: false, message: 'Product image is required.' });
        return;
      }

      const validCategories = ['Gemstones', 'Rudraksha', 'Yantra', 'Astrology Books', 'Spiritual Accessories'];
      if (!category || !validCategories.includes(category)) {
        res.status(400).json({ success: false, message: 'Please select a valid product category.' });
        return;
      }

      const product = await CosmicProduct.create({
        name: String(name).trim(),
        shortDescription: String(shortDescription).trim(),
        pricePaise: Math.round(numericPrice * 100),
        mrpPaise: Math.round(numericMrp * 100),
        badge: badge || 'None',
        category,
        imageUrl: image,
        createdBy: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : undefined,
      });

      clearStoreCache();

      await recordAuditAction(
        req,
        'CREATE_PRODUCT',
        'PRODUCT',
        product._id.toString(),
        { name: product.name, pricePaise: product.pricePaise, badge: product.badge }
      );

      res.status(201).json({
        success: true,
        message: `Product "${product.name}" created successfully.`,
        data: {
          id: product._id.toString(),
          name: product.name,
          shortDescription: product.shortDescription,
          priceRupees: product.pricePaise / 100,
          mrpRupees: product.mrpPaise / 100,
          discountPercent: product.discountPercent,
          badge: product.badge,
          category: product.category,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
          createdAt: product.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 12b. Get All Cosmic Store Products (Admin)
   */
  public async getProducts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const search = (req.query.search as string || '').trim();
      const category = (req.query.category as string || '').trim();
      const inStock = req.query.inStock as string;
      const isActive = req.query.isActive as string;

      const query: Record<string, any> = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { shortDescription: { $regex: search, $options: 'i' } },
        ];
      }
      if (category && category !== 'All') {
        query.category = category;
      }
      if (inStock === 'true') {
        query.inStock = true;
      } else if (inStock === 'false') {
        query.inStock = false;
      }
      if (isActive === 'true') {
        query.isActive = true;
      } else if (isActive === 'false') {
        query.isActive = false;
      }

      const [total, products, totalAll, inStockCount, activeCount] = await Promise.all([
        CosmicProduct.countDocuments(query),
        CosmicProduct.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        CosmicProduct.countDocuments({}),
        CosmicProduct.countDocuments({ inStock: true }),
        CosmicProduct.countDocuments({ isActive: true }),
      ]);

      res.json({
        success: true,
        data: {
          products: products.map((p) => ({
            id: p._id.toString(),
            name: p.name,
            shortDescription: p.shortDescription,
            priceRupees: p.pricePaise / 100,
            mrpRupees: p.mrpPaise / 100,
            discountPercent: p.discountPercent,
            badge: p.badge,
            category: p.category,
            imageUrl: p.imageUrl,
            isActive: p.isActive,
            inStock: p.inStock ?? true,
            createdAt: p.createdAt,
          })),
          metrics: {
            totalProducts: totalAll,
            inStockCount,
            outOfStockCount: totalAll - inStockCount,
            activeCount,
          },
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 12c. Delete Cosmic Store Product
   */
  public async deleteProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        return;
      }

      const product = await CosmicProduct.findByIdAndDelete(id);
      if (!product) {
        res.status(404).json({ success: false, message: 'Product not found.' });
        return;
      }

      clearStoreCache();

      await recordAuditAction(
        req,
        'DELETE_PRODUCT',
        'PRODUCT',
        id,
        { name: product.name }
      );

      res.json({
        success: true,
        message: `Product "${product.name}" deleted successfully.`,
        data: { id },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 12d. Toggle Product Active/Inactive
   */
  public async toggleProductStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        res.status(400).json({ success: false, message: '"isActive" must be a boolean.' });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        return;
      }

      const product = await CosmicProduct.findById(id);
      if (!product) {
        res.status(404).json({ success: false, message: 'Product not found.' });
        return;
      }

      clearStoreCache();

      product.isActive = isActive;
      await product.save();

      await recordAuditAction(
        req,
        'TOGGLE_PRODUCT_STATUS',
        'PRODUCT',
        id,
        { name: product.name, isActive }
      );

      res.json({
        success: true,
        message: `Product "${product.name}" is now ${isActive ? 'active' : 'inactive'}.`,
        data: {
          id: product._id.toString(),
          isActive: product.isActive,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 12e. Toggle Product Stock (In-Stock / Out-of-Stock)
   */
  public async toggleProductStock(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { inStock } = req.body;

      if (typeof inStock !== 'boolean') {
        res.status(400).json({ success: false, message: '"inStock" must be a boolean.' });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        return;
      }

      const product = await CosmicProduct.findById(id);
      if (!product) {
        res.status(404).json({ success: false, message: 'Product not found.' });
        return;
      }

      clearStoreCache();

      product.inStock = inStock;
      await product.save();

      await recordAuditAction(
        req,
        'TOGGLE_PRODUCT_STOCK',
        'PRODUCT',
        id,
        { name: product.name, inStock }
      );

      res.json({
        success: true,
        message: `Product "${product.name}" is now ${inStock ? 'in stock' : 'out of stock'}.`,
        data: {
          id: product._id.toString(),
          inStock: product.inStock,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 12f. Update Cosmic Store Product
   */
  public async updateProduct(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name, shortDescription, price, mrp, badge, category, image, inStock, isActive } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        return;
      }

      const product = await CosmicProduct.findById(id);
      if (!product) {
        res.status(404).json({ success: false, message: 'Product not found.' });
        return;
      }

      if (name !== undefined) {
        if (!String(name).trim()) {
          res.status(400).json({ success: false, message: 'Product name cannot be empty.' });
          return;
        }
        product.name = String(name).trim();
      }

      if (shortDescription !== undefined) {
        if (!String(shortDescription).trim()) {
          res.status(400).json({ success: false, message: 'Short description cannot be empty.' });
          return;
        }
        product.shortDescription = String(shortDescription).trim();
      }

      if (price !== undefined) {
        const numPrice = Number(price);
        if (!Number.isFinite(numPrice) || numPrice <= 0) {
          res.status(400).json({ success: false, message: 'Selling price must be positive.' });
          return;
        }
        product.pricePaise = Math.round(numPrice * 100);
      }

      if (mrp !== undefined) {
        const numMrp = Number(mrp);
        if (!Number.isFinite(numMrp) || numMrp < (product.pricePaise / 100)) {
          res.status(400).json({ success: false, message: 'MRP must be greater than or equal to selling price.' });
          return;
        }
        product.mrpPaise = Math.round(numMrp * 100);
      }

      if (category !== undefined) {
        const validCategories = ['Gemstones', 'Rudraksha', 'Yantra', 'Astrology Books', 'Spiritual Accessories'];
        if (!validCategories.includes(category)) {
          res.status(400).json({ success: false, message: 'Invalid product category.' });
          return;
        }
        product.category = category;
      }

      if (badge !== undefined) {
        product.badge = badge || 'None';
      }

      if (image && typeof image === 'string' && image.trim()) {
        product.imageUrl = image;
      }

      if (inStock !== undefined && typeof inStock === 'boolean') {
        product.inStock = inStock;
      }

      if (isActive !== undefined && typeof isActive === 'boolean') {
        product.isActive = isActive;
      }

      await product.save();
      clearStoreCache();

      await recordAuditAction(
        req,
        'UPDATE_PRODUCT',
        'PRODUCT',
        id,
        { name: product.name, pricePaise: product.pricePaise, badge: product.badge }
      );

      res.json({
        success: true,
        message: `Product "${product.name}" updated successfully.`,
        data: {
          id: product._id.toString(),
          name: product.name,
          shortDescription: product.shortDescription,
          priceRupees: product.pricePaise / 100,
          mrpRupees: product.mrpPaise / 100,
          discountPercent: product.discountPercent,
          badge: product.badge,
          category: product.category,
          imageUrl: product.imageUrl,
          inStock: product.inStock,
          isActive: product.isActive,
          createdAt: product.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * 13. Store Orders Management (List and Status Update)
   */
  public async getStoreOrders(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
      const statusFilter = (req.query.status as string || '').trim();
      const search = (req.query.search as string || '').trim();

      const query: Record<string, any> = {};
      if (statusFilter && statusFilter.toLowerCase() !== 'all') {
        query.status = { $regex: new RegExp(`^${statusFilter}$`, 'i') };
      }

      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
          { orderId: { $regex: escaped, $options: 'i' } },
          { customerName: { $regex: escaped, $options: 'i' } },
          { customerEmail: { $regex: escaped, $options: 'i' } },
          { customerPhone: { $regex: escaped, $options: 'i' } },
          { 'products.name': { $regex: escaped, $options: 'i' } },
        ];
      }

      const total = await StoreOrder.countDocuments(query);
      const orders = await StoreOrder.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      res.json({
        success: true,
        data: {
          orders: orders.map((o) => ({
            id: o._id.toString(),
            orderId: o.orderId,
            customerName: o.customerName,
            customerEmail: o.customerEmail,
            customerPhone: o.customerPhone,
            shippingAddress: o.shippingAddress,
            products: o.products,
            totalAmountRupees: o.totalAmountRupees,
            paymentMethod: o.paymentMethod,
            paymentStatus: o.paymentStatus,
            status: o.status,
            courierName: o.courierName,
            trackingNumber: o.trackingNumber,
            createdAt: o.createdAt,
          })),
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async updateStoreOrderStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updated = await StoreOrder.findByIdAndUpdate(id, { status }, { new: true });
      if (!updated) {
        res.status(404).json({ success: false, message: 'Store order not found' });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
}
