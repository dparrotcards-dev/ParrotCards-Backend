import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { app } from '../src/app';
import { connectDB, disconnectDB } from '../src/config/database';
import { CardDefinition } from '../src/models/CardDefinition';
import { User } from '../src/models/User';
import { BirthProfile } from '../src/models/BirthProfile';
import { PersonalizedDeck } from '../src/models/PersonalizedDeck';
import { PersonalizedCard } from '../src/models/PersonalizedCard';
import { DeckPass } from '../src/models/DeckPass';
import { CardUnlock } from '../src/models/CardUnlock';
import { PaymentOrder } from '../src/models/PaymentOrder';
import { AuditLog } from '../src/models/AuditLog';
import { AstronomicalCalculation } from '../src/models/AstronomicalCalculation';
import { seedCardDefinitions, APPROVED_55_CARDS } from '../src/utils/seedCards';
import { LocationService } from '../src/integrations/location/LocationService';
import { LocalMockAstronomyProvider } from '../src/integrations/astronomy/LocalMockAstronomyProvider';
import { AstronomyService } from '../src/integrations/astronomy/AstronomyService';
import { computeNavamsha, getHouseLord, SIGN_LORDS, SIGN_NAMES } from '../src/utils/astroMath';
import { FREE_CARD_KEYS, EntitlementService } from '../src/services/entitlementService';
import { birthDetailsSchema } from '../src/validators/profileValidators';
import { computeDemographicContext, GeminiService } from '../src/integrations/gemini/GeminiService';
import { PaymentService } from '../src/services/paymentService';
import { RazorpayService, PAYMENT_PRICES } from '../src/integrations/payments/RazorpayService';
import jwt from 'jsonwebtoken';
import { ENV, envSchema } from '../src/config/env';

describe('🌌 Parrot Cards Full Test Suite', () => {
  let authToken = '';
  let authUserId = '';
  let guestSessionId = 'guest_test_session_xyz_123';
  let createdProfileId = '';
  let createdDeckId = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await connectDB();
    await seedCardDefinitions();
  }, 45000);

  afterAll(async () => {
    // Clean up test records
    if (authUserId) {
      await User.findByIdAndDelete(authUserId);
    }
    if (createdProfileId) {
      await BirthProfile.findByIdAndDelete(createdProfileId);
    }
    if (createdDeckId) {
      await PersonalizedDeck.findByIdAndDelete(createdDeckId);
      await PersonalizedCard.deleteMany({ deckId: createdDeckId });
    }
    await disconnectDB();
  });

  describe('1. Card Definitions & Seed Data', () => {
    it('should have exactly 55 approved cards in database', async () => {
      const count = await CardDefinition.countDocuments();
      expect(count).toBe(55);

      const res = await request(app).get('/api/v1/decks/definitions');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(55);
      expect(res.body.data.length).toBe(55);
    });

    it('should contain the 4 core suits (Dharma, Artha, Kama, Moksha) and Master Keys', async () => {
      const dharmaCards = await CardDefinition.find({ suit: 'Dharma' });
      const arthaCards = await CardDefinition.find({ suit: 'Artha' });
      const kamaCards = await CardDefinition.find({ suit: 'Kama' });
      const mokshaCards = await CardDefinition.find({ suit: 'Moksha' });
      const masterKeys = await CardDefinition.find({ suit: 'MasterKey' });

      expect(dharmaCards.length).toBe(13);
      expect(arthaCards.length).toBe(13);
      expect(kamaCards.length).toBe(13);
      expect(mokshaCards.length).toBe(13);
      expect(masterKeys.length).toBe(3);
    });
  });

  describe('2. Location & Timezone Resolution', () => {
    const locService = new LocationService();

    it('should resolve India timezone to UTC+5.5', () => {
      const tz = locService.estimateTimezoneFromCoordinates(26.9124, 75.7873, 'in');
      expect(tz).toBe(5.5);
    });

    it('should provide location suggestions for queries', async () => {
      const res = await request(app).get('/api/v1/locations/search?q=Jaipur');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.length).toBeGreaterThan(0);
      expect(res.body.results[0].timezone).toBeDefined();
    });
  });

  describe('3. Astronomical Provider Adapter', () => {
    it('should calculate deterministic astrological placements via adapter', async () => {
      const adapter = new LocalMockAstronomyProvider();
      const res = await adapter.calculateHoroscope({
        name: 'Arjun',
        date: '1992-04-14',
        time: '08:30:00',
        place: 'Jaipur, Rajasthan',
        latitude: 26.9124,
        longitude: 75.7873,
        timezone: 5.5,
      });

      expect(res.providerName).toBe('local_verified_mock');
      expect(res.rawHoroscope).toBeDefined();
      expect(res.rawHoroscope.nakshatra_pada.length).toBeGreaterThan(10);
    });
  });

  describe('4. Authentication & Security', () => {
    const testEmail = `seeker_${Date.now()}@parrotcards.internal`;

    it('should register a new user with hashed password and return JWT', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: testEmail,
        password: 'password123',
        name: 'Arjun Verma',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.token).toBeDefined();

      authToken = res.body.data.token;
      authUserId = res.body.data.user.id;

      // Verify password was hashed in database
      const dbUser = await User.findById(authUserId);
      expect(dbUser?.passwordHash).not.toBe('password123');
      expect(dbUser?.passwordHash.startsWith('$2b$')).toBe(true);
    });

    it('should sign in with valid credentials', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: testEmail,
        password: 'password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject invalid password', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: testEmail,
        password: 'wrong_password',
      });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });

    it('should return current user profile on /api/v1/auth/me', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(authUserId);
    });
  });

  describe('5. Birth Details Form Validation & Deck Generation', () => {
    it('should reject invalid birth date format', async () => {
      const res = await request(app).post('/api/v1/profiles').send({
        name: 'Arjun',
        date: 'not-a-date',
        time: '12:00',
        place: 'Jaipur',
        latitude: 26.9,
        longitude: 75.8,
        timezone: 5.5,
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('should calculate sky and generate personalized 55-card deck', async () => {
      const res = await request(app)
        .post('/api/v1/profiles')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Arjun Verma',
          gender: 'Male',
          date: '1995-10-25',
          time: '14:30:00',
          place: 'Jaipur, Rajasthan, India',
          latitude: 26.9124,
          longitude: 75.7873,
          timezone: 5.5,
          ianaTimezone: 'Asia/Kolkata',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profile).toBeDefined();
      expect(res.body.data.deck).toBeDefined();
      expect(res.body.data.cards.length).toBe(55);

      createdProfileId = res.body.data.profile._id;
      createdDeckId = res.body.data.deck._id;
    }, 20000);

    it('should enforce first three cards free rule on generated deck', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${createdDeckId}/cards`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const cards = res.body.data.cards;
      expect(cards.length).toBe(55);

      // Verify the first 3 cards: Lagna, Sun, Moon are ALWAYS unlocked and free
      for (const key of FREE_CARD_KEYS) {
        const card = cards.find((c: any) => c.key === key);
        expect(card).toBeDefined();
        expect(card.isFree).toBe(true);
        expect(card.isUnlocked).toBe(true);
      }

      // Verify a non-free card without payment is locked
      const jupiterCard = cards.find((c: any) => c.key === 'Jupiter');
      expect(jupiterCard.isFree).toBe(false);
      expect(jupiterCard.isUnlocked).toBe(false);
      expect(jupiterCard.astronomicalPlacement.sign).toBeNull(); // Masked on server
    });
  });

  describe('6. Payments & Entitlements Enforcement', () => {
    it('should reject purchase of an already free card', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          itemType: 'CARD_UNLOCK',
          cardKey: 'Lagna', // Already free
        });

      expect(res.status).toBe(500);
      expect(res.body.message).toContain('already free');
    });

    it('should create an order for individual card unlock with server price (₹2)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          itemType: 'CARD_UNLOCK',
          cardKey: 'Jupiter',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.amount).toBe(200); // 200 paise = ₹2
      expect(res.body.data.amountRupees).toBe(2);
      expect(res.body.data.currency).toBe('INR');
      expect(res.body.data.razorpayOrderId).toBeDefined();
    });

    it('should reject invalid Razorpay signature', async () => {
      // Create order first
      const orderRes = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          itemType: 'CARD_UNLOCK',
          cardKey: 'Mars',
        });

      const rzpOrderId = orderRes.body.data.razorpayOrderId;

      // Attempt verification with fake signature
      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: 'pay_tampered_12345',
          razorpaySignature: 'tampered_invalid_sig',
        });

      expect(verifyRes.status).toBe(400);
      expect(verifyRes.body.success).toBe(false);
    });

    it('should successfully verify payment and grant card unlock in simulated test mode', async () => {
      const orderRes = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          itemType: 'CARD_UNLOCK',
          cardKey: 'Mercury',
        });

      expect(orderRes.status).toBe(201);
      const rzpOrderId = orderRes.body.data.razorpayOrderId;

      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: `pay_test_mercury_${Date.now()}`,
          razorpaySignature: 'simulated_valid_sig',
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      // Verify card unlock record was created in DB
      const unlock = await CardUnlock.findOne({
        userId: new mongoose.Types.ObjectId(authUserId),
        cardKey: 'Mercury',
      });
      expect(unlock).toBeDefined();
    });

    it('should create order and grant 30-day Deck Pass with server price (₹25)', async () => {
      const orderRes = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          itemType: 'DECK_PASS',
        });

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.data.amount).toBe(2500); // 2500 paise = ₹25
      expect(orderRes.body.data.amountRupees).toBe(25);

      const rzpOrderId = orderRes.body.data.razorpayOrderId;

      const verifyRes = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: `pay_test_deck_pass_${Date.now()}`,
          razorpaySignature: 'simulated_valid_sig',
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.passExpiresAt).toBeDefined();

      // Check DeckPass document in Mongo has 30 days validity
      const pass = await DeckPass.findOne({
        userId: new mongoose.Types.ObjectId(authUserId),
        isActive: true,
      });
      expect(pass).toBeDefined();
      const thirtyDaysMs = 29 * 24 * 60 * 60 * 1000;
      expect(new Date(pass!.expiresAt).getTime() - Date.now()).toBeGreaterThan(thirtyDaysMs);
    });

    it('should now report ALL cards as unlocked due to active 30-day Deck Pass', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${createdDeckId}/cards`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const cards = res.body.data.cards;
      expect(res.body.data.entitlements.isDeckPassActive).toBe(true);

      // All cards should now be unlocked
      const lockedCards = cards.filter((c: any) => !c.isUnlocked);
      expect(lockedCards.length).toBe(0);
    });

    it('should record transactions in payment history', async () => {
      const res = await request(app)
        .get('/api/v1/payments/history')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('7. Gemini AI Interpretation Service & Avatar', () => {
    it('should generate deep card interpretation for unlocked card', async () => {
      const res = await request(app)
        .post('/api/v1/interpretations/cards/Lagna/interpretation')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          deckId: createdDeckId,
          userName: 'Arjun Verma',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.interpretation).toBeDefined();
      expect(res.body.data.interpretation.deeperExplanation).toBeDefined();
      expect(res.body.data.interpretation.reflectionPrompt).toBeDefined();
    });

    it('should retrieve Sovereign Avatar for the deck', async () => {
      const res = await request(app)
        .get(`/api/v1/interpretations/decks/${createdDeckId}/avatar`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.avatarPhrase).toBeDefined();
    });
  });

  describe('8. Unauthorized Access Protections', () => {
    it('should prevent user from accessing another user account details', async () => {
      const res = await request(app).get('/api/v1/account'); // No auth header
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('9. Jagannatha Hora Integration & Navamsha/HouseLord Safety Verification', () => {
    const astroService = new AstronomyService('mock');
    const mockProvider = new LocalMockAstronomyProvider();

    const sampleBirthInput = {
      name: 'Safety Test Profile',
      date: '1995-10-24',
      time: '14:30',
      place: 'Jaipur, Rajasthan',
      latitude: 26.9124,
      longitude: 75.7873,
      timezone: 5.5,
    };

    let testProfileId: mongoose.Types.ObjectId;

    beforeAll(async () => {
      const utcDate = astroService.computeUtcDate(sampleBirthInput.date, sampleBirthInput.time, sampleBirthInput.timezone);
      const profile = await BirthProfile.create({
        name: sampleBirthInput.name,
        gender: 'Male',
        dateOfBirth: sampleBirthInput.date,
        timeOfBirth: sampleBirthInput.time,
        place: sampleBirthInput.place,
        latitude: sampleBirthInput.latitude,
        longitude: sampleBirthInput.longitude,
        timezone: sampleBirthInput.timezone,
        utcDateTime: utcDate,
        guestSessionId: 'safety_test_guest_session',
      });
      testProfileId = profile._id as mongoose.Types.ObjectId;
    });

    afterAll(async () => {
      if (testProfileId) {
        await BirthProfile.findByIdAndDelete(testProfileId);
        await AstronomicalCalculation.deleteMany({ profileId: testProfileId });
      }
    });

    it('Safety Req 1 & 2: Validates Navamsha (D9) formula accurately matches classical Parashara & API', () => {
      // 1. Fiery Sign (Aries 0) starts from Aries (0)
      expect(computeNavamsha(0, 0.0)).toEqual({ navamshaSign: 0, navamshaSignName: 'Aries' });
      expect(computeNavamsha(0, 3.5)).toEqual({ navamshaSign: 1, navamshaSignName: 'Taurus' });
      expect(computeNavamsha(0, 28.0)).toEqual({ navamshaSign: 8, navamshaSignName: 'Sagittarius' });

      // 2. Earthy Sign (Taurus 1) starts from Capricorn (9)
      expect(computeNavamsha(1, 0.0)).toEqual({ navamshaSign: 9, navamshaSignName: 'Capricorn' });
      expect(computeNavamsha(1, 4.0)).toEqual({ navamshaSign: 10, navamshaSignName: 'Aquarius' });

      // 3. Airy Sign (Gemini 2) starts from Libra (6)
      expect(computeNavamsha(2, 0.0)).toEqual({ navamshaSign: 6, navamshaSignName: 'Libra' });

      // 4. Watery Sign (Cancer 3) starts from Cancer (3)
      expect(computeNavamsha(3, 0.0)).toEqual({ navamshaSign: 3, navamshaSignName: 'Cancer' });

      // 5. Verification against actual Jagannatha Hora Cloud Run API responses:
      // Real API Case A: Sun in Libra (6) at 7.6785° -> D9 Sagittarius (8)
      const sunNav = computeNavamsha(6, 7.6785);
      expect(sunNav.navamshaSign).toBe(8);
      expect(sunNav.navamshaSignName).toBe('Sagittarius');

      // Real API Case B: Lagna in Aquarius (10) at 1.1472° -> D9 Libra (6)
      const lagnaNav = computeNavamsha(10, 1.1472);
      expect(lagnaNav.navamshaSign).toBe(6);
      expect(lagnaNav.navamshaSignName).toBe('Libra');
    });

    it('Safety Req 1: House Lord (Dispositor) matches occupied sign ruler for all 12 signs', () => {
      const expectedLords = [
        'Mars',     // Aries
        'Venus',    // Taurus
        'Mercury',  // Gemini
        'Moon',     // Cancer
        'Sun',      // Leo
        'Mercury',  // Virgo
        'Venus',    // Libra
        'Mars',     // Scorpio
        'Jupiter',  // Sagittarius
        'Saturn',   // Capricorn
        'Saturn',   // Aquarius
        'Jupiter',  // Pisces
      ];

      for (let s = 0; s < 12; s++) {
        expect(getHouseLord(s)).toBe(expectedLords[s]);
        expect(SIGN_LORDS[s]).toBe(expectedLords[s]);
      }
      expect(getHouseLord(null)).toBeNull();
    });

    it('Safety Req 1 & 7: Populates navamshaSign, navamshaSignName, and houseLord for ALL 55 cards', async () => {
      const mockResult = await mockProvider.calculateHoroscope(sampleBirthInput);
      const parsed = astroService.parseHoroscopeData(mockResult.rawHoroscope);

      expect(parsed.foundCount).toBeGreaterThanOrEqual(50);
      expect(APPROVED_55_CARDS.length).toBe(55);

      for (const card of APPROVED_55_CARDS) {
        const placement = parsed.points[card.key];
        expect(placement).toBeDefined();

        // Every card placement must have navamshaSign, navamshaSignName, and houseLord
        expect(placement.navamshaSign).not.toBeNull();
        expect(typeof placement.navamshaSign).toBe('number');
        expect(placement.navamshaSign).toBeGreaterThanOrEqual(0);
        expect(placement.navamshaSign).toBeLessThanOrEqual(11);

        expect(placement.navamshaSignName).toBeDefined();
        expect(typeof placement.navamshaSignName).toBe('string');
        expect(SIGN_NAMES).toContain(placement.navamshaSignName);

        expect(placement.houseLord).toBeDefined();
        expect(typeof placement.houseLord).toBe('string');
        expect(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']).toContain(placement.houseLord);
      }
    });

    it('Safety Req 3: Persists lean rawHoroscope for new calculations without 3.5 MB unneeded payload', async () => {
      const calc = await astroService.getOrCalculate(testProfileId, sampleBirthInput);
      expect(calc).toBeDefined();
      expect(calc.profileId.toString()).toBe(testProfileId.toString());

      // Read directly from DB to verify raw storage footprint
      const dbDoc = await AstronomicalCalculation.findById(calc._id).lean();
      expect(dbDoc).not.toBeNull();

      // Check rawHoroscope footprint
      const rawString = JSON.stringify(dbDoc!.rawHoroscope);
      // New lean storage should be under 500 bytes (far below the 3.5 MB bloat)
      expect(rawString.length).toBeLessThan(1024);
      expect(dbDoc!.rawHoroscope.ayanamsa).toBeDefined();
      expect(dbDoc!.rawHoroscope.engine_revision).toBeDefined();

      // Ensure optional unneeded reports are NOT saved in rawHoroscope
      expect(dbDoc!.rawHoroscope.dashas).toBeUndefined();
      expect(dbDoc!.rawHoroscope.shadbala).toBeUndefined();
      expect(dbDoc!.rawHoroscope.ashtakavarga).toBeUndefined();
    });

    it('Safety Req 6: Reuses cached calculation without redundant provider calls', async () => {
      const startMs = Date.now();
      const cachedCalc = await astroService.getOrCalculate(testProfileId, sampleBirthInput);
      const elapsedMs = Date.now() - startMs;

      // Must return existing record immediately (< 100ms)
      expect(cachedCalc).toBeDefined();
      expect(elapsedMs).toBeLessThan(100);
      expect(cachedCalc.foundPointsCount).toBeGreaterThan(10);
    });

    it('Safety Req 6: Backward compatibility - dynamically enriches legacy calculations lacking Navamsha/HouseLord', () => {
      const legacyPoints: Record<string, any> = {
        Sun: { sign: 6, deg: 7.68, house: 7, nak: 'Swati', pada: 1 },
        Moon: { sign: 3, deg: 12.5, house: 4, nak: 'Pushya', pada: 3 },
        Lagna: { sign: 10, deg: 1.15, house: 1, nak: 'Dhanishta', pada: 3 },
      };

      astroService.enrichParsedPoints(legacyPoints);

      // Verify Sun
      expect(legacyPoints.Sun.navamshaSign).toBe(8); // Sagittarius
      expect(legacyPoints.Sun.navamshaSignName).toBe('Sagittarius');
      expect(legacyPoints.Sun.houseLord).toBe('Venus');

      // Verify Moon
      expect(legacyPoints.Moon.navamshaSign).toBe(6); // Libra: (3*30 + 12.5) * 0.3 = 30.75 -> 30 % 12 = 6
      expect(legacyPoints.Moon.navamshaSignName).toBe('Libra');
      expect(legacyPoints.Moon.houseLord).toBe('Moon');

      // Verify Lagna
      expect(legacyPoints.Lagna.navamshaSign).toBe(6); // Libra
      expect(legacyPoints.Lagna.navamshaSignName).toBe('Libra');
    });
  });

  describe('8. Cross-User IDOR Security & Resource Isolation', () => {
    let userAId: string;
    let userAToken: string;
    let userADeckId: string;
    let userAProfileId: string;
    let userACalculationId: string;
    let userBId: string;
    let userBToken: string;

    beforeAll(async () => {
      // Create User A
      const userA = await User.create({
        name: 'User A',
        email: `usera_${Date.now()}@example.com`,
        passwordHash: 'hashed_pwd_a',
        role: 'user',
      });
      userAId = userA._id.toString();
      userAToken = jwt.sign({ id: userAId, email: userA.email }, ENV.JWT_SECRET, { expiresIn: '1h' });

      // Create User B (Attacker)
      const userB = await User.create({
        name: 'User B',
        email: `userb_${Date.now()}@example.com`,
        passwordHash: 'hashed_pwd_b',
        role: 'user',
      });
      userBId = userB._id.toString();
      userBToken = jwt.sign({ id: userBId, email: userB.email }, ENV.JWT_SECRET, { expiresIn: '1h' });

      // Create BirthProfile, Calculation, Deck for User A
      const profileA = await BirthProfile.create({
        userId: userA._id,
        name: 'User A',
        gender: 'Male',
        dateOfBirth: '1990-01-01',
        timeOfBirth: '10:00:00',
        place: 'New Delhi, India',
        latitude: 28.6139,
        longitude: 77.209,
        timezone: 5.5,
        utcDateTime: new Date('1990-01-01T04:30:00.000Z'),
      });
      userAProfileId = profileA._id.toString();

      const calculationA = await AstronomicalCalculation.create({
        profileId: profileA._id,
        provider: 'mock',
        calculationVersion: '1.0.0',
        inputSnapshot: {
          date: '1990-01-01',
          time: '10:00:00',
          place: 'New Delhi, India',
          latitude: 28.6139,
          longitude: 77.209,
          timezone: 5.5,
          utcDateTime: new Date('1990-01-01T04:30:00.000Z'),
        },
        rawHoroscope: { ayanamsa: 'Lahiri', engine_revision: '1.0.0' },
        parsedPoints: {
          Lagna: { sign: 1, deg: 10, house: 1, nak: 'Rohini', pada: 1, lord: 'Moon', isSovereign: false },
          Sun: { sign: 8, deg: 15, house: 8, nak: 'Purva Ashadha', pada: 1, lord: 'Venus', isSovereign: true },
        },
        lagSign: 1,
        akPlanet: 'Sun',
        foundPointsCount: 55,
        totalPointsCount: 55,
        calculatedAt: new Date(),
      });
      userACalculationId = calculationA._id.toString();

      const deckA = await PersonalizedDeck.create({
        userId: userA._id,
        profileId: profileA._id,
        calculationId: calculationA._id,
        sovereignCardKey: 'Sun',
        avatarPhrase: 'The Radiant Solar Sovereign',
        avatarSummary: 'Summary of User A soul destiny',
        totalCards: 55,
        generatedAt: new Date(),
      });
      userADeckId = deckA._id.toString();

      const cardDef = await CardDefinition.findOne({ key: 'Sun' });
      await PersonalizedCard.create({
        deckId: deckA._id,
        cardDefId: cardDef ? cardDef._id : new mongoose.Types.ObjectId(),
        userId: userA._id,
        cardId: 'DHARMA_K_13',
        suit: 'Dharma',
        suitSymbol: '♠',
        rank: 'K',
        label: 'Surya',
        key: 'Sun',
        title: 'The Solar Monarch',
        line: 'The sun asks permission of no one to rise.',
        shortSummary: 'Central soul light, supreme moral authority, and core identity.',
        position: 13,
        astronomicalPlacement: { sign: 8, deg: 15, house: 8, nak: 'Purva Ashadha', pada: 1, lord: 'Venus', isSovereign: true },
        isSovereign: true,
        isFree: true,
      });
    });

    afterAll(async () => {
      await User.deleteMany({ _id: { $in: [userAId, userBId] } });
      await BirthProfile.deleteMany({ userId: userAId });
      await AstronomicalCalculation.deleteMany({ _id: userACalculationId });
      await PersonalizedDeck.deleteMany({ _id: userADeckId });
      await PersonalizedCard.deleteMany({ deckId: userADeckId });
    });

    it('IDOR: User B cannot access User A deck via GET /api/v1/decks/:id', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${userADeckId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Access denied/i);
    });

    it('IDOR: User B cannot fetch User A deck cards via GET /api/v1/decks/:id/cards', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${userADeckId}/cards`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Access denied/i);
    });

    it('IDOR: User B cannot fetch Sovereign Avatar for User A deck via GET /api/v1/interpretations/decks/:id/avatar', async () => {
      const res = await request(app)
        .get(`/api/v1/interpretations/decks/${userADeckId}/avatar`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Access denied/i);
    });

    it('IDOR: User B cannot fetch interpretation for User A deck via POST /api/v1/interpretations/cards/:key/interpretation', async () => {
      const res = await request(app)
        .post('/api/v1/interpretations/cards/Sun/interpretation')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ deckId: userADeckId, userName: 'Attacker' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Access denied/i);
    });

    it('IDOR: User B cannot access User A calculation via GET /api/v1/astronomy/:profileId', async () => {
      const res = await request(app)
        .get(`/api/v1/astronomy/${userAProfileId}`)
        .set('Authorization', `Bearer ${userBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Unauthorized access/i);
    });

    it('Owner Access: User A can access their own deck and calculation', async () => {
      const resDeck = await request(app)
        .get(`/api/v1/decks/${userADeckId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(resDeck.status).toBe(200);
      expect(resDeck.body.success).toBe(true);
      expect(resDeck.body.data.deck._id.toString()).toBe(userADeckId);

      const resCalc = await request(app)
        .get(`/api/v1/astronomy/${userAProfileId}`)
        .set('Authorization', `Bearer ${userAToken}`);

      expect(resCalc.status).toBe(200);
      expect(resCalc.body.success).toBe(true);
    });
  });

  describe('8b. Comprehensive Guest Authorization & Ownership Regression Tests', () => {
    const guestAId = 'guest_session_alpha_123';
    const guestBId = 'guest_session_bravo_456';

    let guestADeckId: string;
    let guestAProfileId: string;
    let guestACalculationId: string;

    let userCId: string;
    let userCToken: string;

    beforeAll(async () => {
      // Authenticated User C
      const userC = await User.create({
        name: 'User C',
        email: `userc_${Date.now()}@example.com`,
        passwordHash: 'hashed_pwd_c',
        role: 'user',
      });
      userCId = userC._id.toString();
      userCToken = jwt.sign({ id: userCId, email: userC.email }, ENV.JWT_SECRET, { expiresIn: '1h' });

      // Guest A Profile, Calculation, Deck
      const profileA = await BirthProfile.create({
        guestSessionId: guestAId,
        name: 'Guest A',
        gender: 'Female',
        dateOfBirth: '1992-05-15',
        timeOfBirth: '08:30:00',
        place: 'Mumbai, India',
        latitude: 19.076,
        longitude: 72.8777,
        timezone: 5.5,
        utcDateTime: new Date('1992-05-15T03:00:00.000Z'),
      });
      guestAProfileId = profileA._id.toString();

      const calculationA = await AstronomicalCalculation.create({
        profileId: profileA._id,
        provider: 'mock',
        calculationVersion: '1.0.0',
        inputSnapshot: {
          date: '1992-05-15',
          time: '08:30:00',
          place: 'Mumbai, India',
          latitude: 19.076,
          longitude: 72.8777,
          timezone: 5.5,
          utcDateTime: new Date('1992-05-15T03:00:00.000Z'),
        },
        rawHoroscope: { ayanamsa: 'Lahiri', engine_revision: '1.0.0' },
        parsedPoints: {
          Lagna: { sign: 2, deg: 15, house: 1, nak: 'Ardra', pada: 2, lord: 'Mercury', isSovereign: false },
          Sun: { sign: 1, deg: 1, house: 12, nak: 'Krittika', pada: 2, lord: 'Sun', isSovereign: true },
        },
        lagSign: 2,
        akPlanet: 'Sun',
        foundPointsCount: 55,
        totalPointsCount: 55,
        calculatedAt: new Date(),
      });
      guestACalculationId = calculationA._id.toString();

      const deckA = await PersonalizedDeck.create({
        guestSessionId: guestAId,
        profileId: profileA._id,
        calculationId: calculationA._id,
        sovereignCardKey: 'Sun',
        avatarPhrase: 'The Radiant Solar Sovereign of Guest A',
        avatarSummary: 'Summary of Guest A destiny',
        totalCards: 55,
        generatedAt: new Date(),
      });
      guestADeckId = deckA._id.toString();

      const cardDef = await CardDefinition.findOne({ key: 'Sun' });
      await PersonalizedCard.create({
        deckId: deckA._id,
        guestSessionId: guestAId,
        cardDefId: cardDef ? cardDef._id : new mongoose.Types.ObjectId(),
        cardId: 'DHARMA_K_13',
        suit: 'Dharma',
        suitSymbol: '♠',
        rank: 'K',
        label: 'Surya',
        key: 'Sun',
        title: 'The Solar Monarch',
        line: 'The sun asks permission of no one to rise.',
        shortSummary: 'Central soul light.',
        position: 13,
        astronomicalPlacement: { sign: 1, deg: 1, house: 12, nak: 'Krittika', pada: 2, lord: 'Sun', isSovereign: true },
        isSovereign: true,
        isFree: true,
      });
    });

    afterAll(async () => {
      await User.findByIdAndDelete(userCId);
      await BirthProfile.findByIdAndDelete(guestAProfileId);
      await AstronomicalCalculation.findByIdAndDelete(guestACalculationId);
      await PersonalizedDeck.findByIdAndDelete(guestADeckId);
      await PersonalizedCard.deleteMany({ deckId: guestADeckId });
    });

    // 1. Deck Access
    it('Guest B (mismatched guest ID) cannot access Guest A deck', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${guestADeckId}`)
        .set('X-Guest-Session-Id', guestBId);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeUndefined();
    });

    it('Request with MISSING guest session header cannot access Guest A deck', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${guestADeckId}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeUndefined();
    });

    it('Authenticated user without matching guest session cannot access Guest A deck', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${guestADeckId}`)
        .set('Authorization', `Bearer ${userCToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeUndefined();
    });

    it('Guest A with matching guest session header CAN access Guest A deck', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${guestADeckId}`)
        .set('X-Guest-Session-Id', guestAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deck._id.toString()).toBe(guestADeckId);
    });

    // 2. Cards Access
    it('Guest B cannot fetch Guest A cards', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${guestADeckId}/cards`)
        .set('X-Guest-Session-Id', guestBId);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeUndefined();
    });

    it('Request with missing guest header cannot fetch Guest A cards', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${guestADeckId}/cards`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Authenticated user cannot fetch Guest A cards', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${guestADeckId}/cards`)
        .set('Authorization', `Bearer ${userCToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Guest A can fetch their own cards', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${guestADeckId}/cards`)
        .set('X-Guest-Session-Id', guestAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.cards).toBeDefined();
    });

    // 3. Avatar Access
    it('Guest B cannot fetch Guest A sovereign avatar', async () => {
      const res = await request(app)
        .get(`/api/v1/interpretations/decks/${guestADeckId}/avatar`)
        .set('X-Guest-Session-Id', guestBId);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Missing guest header cannot fetch Guest A avatar', async () => {
      const res = await request(app)
        .get(`/api/v1/interpretations/decks/${guestADeckId}/avatar`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    // 4. Card Interpretation
    it('Guest B cannot request interpretation for Guest A deck', async () => {
      const res = await request(app)
        .post('/api/v1/interpretations/cards/Sun/interpretation')
        .set('X-Guest-Session-Id', guestBId)
        .send({ deckId: guestADeckId, userName: 'Attacker' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Missing guest header cannot request interpretation for Guest A deck', async () => {
      const res = await request(app)
        .post('/api/v1/interpretations/cards/Sun/interpretation')
        .send({ deckId: guestADeckId, userName: 'Attacker' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    // 5. Profile Update
    it('Guest B cannot update Guest A profile', async () => {
      const res = await request(app)
        .patch(`/api/v1/profiles/${guestAProfileId}`)
        .set('X-Guest-Session-Id', guestBId)
        .send({ name: 'Tampered Name' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Missing guest header cannot update Guest A profile', async () => {
      const res = await request(app)
        .patch(`/api/v1/profiles/${guestAProfileId}`)
        .send({ name: 'Tampered Name' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Guest A can update their own profile', async () => {
      const res = await request(app)
        .patch(`/api/v1/profiles/${guestAProfileId}`)
        .set('X-Guest-Session-Id', guestAId)
        .send({ name: 'Guest A Updated' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profile.name).toBe('Guest A Updated');
    });

    // 6. Astronomy Calculation
    it('Guest B cannot access Guest A calculation', async () => {
      const res = await request(app)
        .get(`/api/v1/astronomy/${guestAProfileId}`)
        .set('X-Guest-Session-Id', guestBId);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Missing guest header cannot access Guest A calculation', async () => {
      const res = await request(app)
        .get(`/api/v1/astronomy/${guestAProfileId}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Authenticated user without matching guest header cannot access Guest A calculation', async () => {
      const res = await request(app)
        .get(`/api/v1/astronomy/${guestAProfileId}`)
        .set('Authorization', `Bearer ${userCToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('Guest A with matching header CAN access their calculation', async () => {
      const res = await request(app)
        .get(`/api/v1/astronomy/${guestAProfileId}`)
        .set('X-Guest-Session-Id', guestAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.calculation).toBeDefined();
    });

    // 7. Profile Me endpoint
    it('GET /api/v1/profiles/me with missing credentials returns 401 Unauthorized', async () => {
      const res = await request(app)
        .get('/api/v1/profiles/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/v1/profiles/me with Guest A session returns Guest A profile', async () => {
      const res = await request(app)
        .get('/api/v1/profiles/me')
        .set('X-Guest-Session-Id', guestAId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.profile._id.toString()).toBe(guestAProfileId);
    });
  });

  describe('9. Payment Security & Signature Bypass Lockdown', () => {
    const paymentService = new PaymentService();
    const rzpService = new RazorpayService();

    it('Server-side pricing: Card unlock price is ₹2 (200 paise), Deck pass is ₹25 (2500 paise)', () => {
      expect(rzpService.getPriceForType('CARD_UNLOCK')).toBe(200);
      expect(rzpService.getPriceForType('DECK_PASS')).toBe(2500);
      expect(PAYMENT_PRICES.CARD_UNLOCK).toBe(200);
      expect(PAYMENT_PRICES.DECK_PASS).toBe(2500);
    });

    it('Signature lockdown: simulated_valid_sig is REJECTED outside test mode or for non-simulated orders', () => {
      // Non-simulated order in test mode should reject simulated signature
      const isSimAcceptedForRealOrder = rzpService.verifySignature(
        'order_real_12345',
        'pay_test_999',
        'simulated_valid_sig'
      );
      expect(isSimAcceptedForRealOrder).toBe(false);

      // In non-test mode (e.g. production/development), simulated signature is ALWAYS rejected
      const originalEnv = ENV.NODE_ENV;
      const originalProcessEnv = process.env.NODE_ENV;
      try {
        (ENV as any).NODE_ENV = 'production';
        process.env.NODE_ENV = 'production';
        const isAcceptedInProd = rzpService.verifySignature(
          'order_sim_12345',
          'pay_test_999',
          'simulated_valid_sig'
        );
        expect(isAcceptedInProd).toBe(false);
      } finally {
        (ENV as any).NODE_ENV = originalEnv;
        process.env.NODE_ENV = originalProcessEnv;
      }
    });

    it('Cryptographic HMAC verification: valid HMAC signature succeeds, forged signature fails', () => {
      const orderId = 'order_valid_xyz123';
      const paymentId = 'pay_valid_abc456';
      const validHmac = crypto
        .createHmac('sha256', ENV.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      expect(rzpService.verifySignature(orderId, paymentId, validHmac)).toBe(true);
      expect(rzpService.verifySignature(orderId, paymentId, 'forged_tampered_sig')).toBe(false);
    });

    it('Webhook Idempotency: duplicate webhook events do not grant duplicate entitlements', async () => {
      const testUserId = new mongoose.Types.ObjectId();
      const testOrderId = `rcpt_wh_${Date.now()}`;
      const rzpOrderId = `order_wh_${Date.now()}`;
      const rzpPaymentId = `pay_wh_${Date.now()}`;

      // Create PaymentOrder in DB
      await PaymentOrder.create({
        userId: testUserId,
        orderId: testOrderId,
        razorpayOrderId: rzpOrderId,
        itemType: 'CARD_UNLOCK',
        itemId: 'Mars',
        amountPaise: 200,
        currency: 'INR',
        status: 'CREATED',
      });

      const eventPayload = {
        id: `evt_test_${Date.now()}`,
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: rzpPaymentId,
              order_id: rzpOrderId,
              amount: 200,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = crypto
        .createHmac('sha256', ENV.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      // First webhook execution
      const firstResult = await paymentService.handleWebhook(rawBody, signature, eventPayload);
      expect(firstResult.processed).toBe(true);

      const unlockCountAfterFirst = await CardUnlock.countDocuments({ userId: testUserId, cardKey: 'Mars' });
      expect(unlockCountAfterFirst).toBe(1);

      // Replayed / duplicate webhook execution with same eventId
      const secondResult = await paymentService.handleWebhook(rawBody, signature, eventPayload);
      expect(secondResult.processed).toBe(true);

      // Entitlement must remain exactly 1 (no duplicate unlocks)
      const unlockCountAfterSecond = await CardUnlock.countDocuments({ userId: testUserId, cardKey: 'Mars' });
      expect(unlockCountAfterSecond).toBe(1);

      // Clean up
      await PaymentOrder.deleteMany({ userId: testUserId });
      await CardUnlock.deleteMany({ userId: testUserId });
    });

    it('Entitlement expiry: expired deck pass no longer unlocks cards', async () => {
      const testUserId = new mongoose.Types.ObjectId().toString();
      const entitlementService = new EntitlementService();

      // Create expired pass (expired 1 day ago)
      await DeckPass.create({
        userId: new mongoose.Types.ObjectId(testUserId),
        orderId: 'rcpt_expired_1',
        paymentId: 'pay_expired_1',
        passType: '30_DAY_PASS',
        amountPaise: 2500,
        startsAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expired!
        isActive: true,
      });

      const entitlements = await entitlementService.getUserEntitlements(testUserId);
      expect(entitlements.isDeckPassActive).toBe(false);

      // Paid non-free card should be locked
      const isJupiterUnlocked = entitlementService.isCardUnlocked('Jupiter', entitlements);
      expect(isJupiterUnlocked).toBe(false);

      // Free cards remain unlocked
      expect(entitlementService.isCardUnlocked('Lagna', entitlements)).toBe(true);
      expect(entitlementService.isCardUnlocked('Sun', entitlements)).toBe(true);
      expect(entitlementService.isCardUnlocked('Moon', entitlements)).toBe(true);

      await DeckPass.deleteMany({ userId: new mongoose.Types.ObjectId(testUserId) });
    });
  });

  describe('10. Onboarding & Birthplace Accuracy Validation', () => {
    it('Gender is mandatory: missing or empty gender throws validation error', () => {
      const resultMissing = birthDetailsSchema.safeParse({
        name: 'Arjun',
        date: '1995-10-25',
        time: '12:00',
        place: 'Jaipur, India',
        latitude: 26.9124,
        longitude: 75.7873,
        timezone: 5.5,
      });
      expect(resultMissing.success).toBe(false);
      if (!resultMissing.success) {
        expect(resultMissing.error.issues.some((i) => i.path.includes('gender'))).toBe(true);
      }
    });

    it('Supported gender values: Male, Female, Other, Non-Binary are accepted', () => {
      ['Male', 'Female', 'Other', 'Non-Binary'].forEach((g) => {
        const result = birthDetailsSchema.safeParse({
          name: 'Arjun',
          gender: g,
          date: '1995-10-25',
          time: '12:00',
          place: 'Jaipur, India',
          latitude: 26.9124,
          longitude: 75.7873,
          timezone: 5.5,
        });
        expect(result.success).toBe(true);
      });
    });

    it('Rejects future birth date or invalid format', () => {
      const futureDate = birthDetailsSchema.safeParse({
        name: 'Arjun',
        gender: 'Male',
        date: '2099-01-01',
        time: '12:00',
        place: 'Jaipur, India',
        latitude: 26.9124,
        longitude: 75.7873,
        timezone: 5.5,
      });
      expect(futureDate.success).toBe(false);

      const invalidFormat = birthDetailsSchema.safeParse({
        name: 'Arjun',
        gender: 'Male',
        date: '25-10-1995',
        time: '12:00',
        place: 'Jaipur, India',
        latitude: 26.9124,
        longitude: 75.7873,
        timezone: 5.5,
      });
      expect(invalidFormat.success).toBe(false);
    });

    it('Rejects invalid latitude/longitude coordinates', () => {
      const invalidLat = birthDetailsSchema.safeParse({
        name: 'Arjun',
        gender: 'Male',
        date: '1995-10-25',
        time: '12:00',
        place: 'Jaipur, India',
        latitude: 95.0, // > 90
        longitude: 75.7873,
        timezone: 5.5,
      });
      expect(invalidLat.success).toBe(false);
    });
  });

  describe('11. Authoritative 55-Card Ontological Mapping Verification', () => {
    it('Matches authoritative 55-card structure from PDF Specification', () => {
      expect(APPROVED_55_CARDS.length).toBe(55);

      // Verify Suits
      const dharma = APPROVED_55_CARDS.filter((c) => c.suit === 'Dharma');
      const artha = APPROVED_55_CARDS.filter((c) => c.suit === 'Artha');
      const kama = APPROVED_55_CARDS.filter((c) => c.suit === 'Kama');
      const moksha = APPROVED_55_CARDS.filter((c) => c.suit === 'Moksha');
      const masterKeys = APPROVED_55_CARDS.filter((c) => c.suit === 'MasterKey');

      expect(dharma.length).toBe(13);
      expect(artha.length).toBe(13);
      expect(kama.length).toBe(13);
      expect(moksha.length).toBe(13);
      expect(masterKeys.length).toBe(3);

      // Verify Positions are exactly 1 to 55 with no gaps or duplicates
      const positions = APPROVED_55_CARDS.map((c) => c.position).sort((a, b) => a - b);
      expect(positions).toEqual(Array.from({ length: 55 }, (_, i) => i + 1));

      // Key Ontological Anchor Verifications explicitly mandated:
      // 1. Janma Lagna = Ace of Spades / Dharma
      const janmaLagna = APPROVED_55_CARDS.find((c) => c.position === 1);
      expect(janmaLagna).toBeDefined();
      expect(janmaLagna?.rank).toBe('A');
      expect(janmaLagna?.suit).toBe('Dharma');
      expect(janmaLagna?.key).toBe('Lagna');
      expect(janmaLagna?.title).toBe('The Inception Point');
      expect(janmaLagna?.isFreeByDefault).toBe(true);

      // 2. Surya = King of Spades / Dharma
      const surya = APPROVED_55_CARDS.find((c) => c.position === 13);
      expect(surya).toBeDefined();
      expect(surya?.rank).toBe('K');
      expect(surya?.suit).toBe('Dharma');
      expect(surya?.key).toBe('Sun');
      expect(surya?.title).toBe('The Solar Monarch');
      expect(surya?.isFreeByDefault).toBe(true);

      // 3. Chandra = King of Hearts / Kama
      const chandra = APPROVED_55_CARDS.find((c) => c.position === 39);
      expect(chandra).toBeDefined();
      expect(chandra?.rank).toBe('K');
      expect(chandra?.suit).toBe('Kama');
      expect(chandra?.key).toBe('Moon');
      expect(chandra?.title).toBe('The Heart Itself');
      expect(chandra?.isFreeByDefault).toBe(true);

      // 4. Varnada Lagnas distribution across suits:
      // Dharma: V1 (2 ♠), V9 (3 ♠), V10 (4 ♠)
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V1')?.suit).toBe('Dharma');
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V9')?.suit).toBe('Dharma');
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V10')?.suit).toBe('Dharma');

      // Artha: V2 (5 ♦), V4 (6 ♦), V11 (7 ♦), V6 (J ♦)
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V2')?.suit).toBe('Artha');
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V4')?.suit).toBe('Artha');
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V11')?.suit).toBe('Artha');
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V6')?.suit).toBe('Artha');

      // Kama: V3 (2 ♥), V5 (3 ♥), V7 (4 ♥)
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V3')?.suit).toBe('Kama');
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V5')?.suit).toBe('Kama');
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V7')?.suit).toBe('Kama');

      // Moksha: V12 (A ♣), V8 (2 ♣)
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V12')?.suit).toBe('Moksha');
      expect(APPROVED_55_CARDS.find((c) => c.key === 'V8')?.suit).toBe('Moksha');

      // 5. Three Transcendent Master Keys (Tattva-Trimurti)
      const mk0 = APPROVED_55_CARDS.find((c) => c.position === 53);
      expect(mk0?.key).toBe('Arudha Lagna');
      expect(mk0?.rank).toBe('Key 0');
      expect(mk0?.title).toBe('The Mirror of Maya');

      const mk1 = APPROVED_55_CARDS.find((c) => c.position === 54);
      expect(mk1?.key).toBe('Beeja Sphuta');
      expect(mk1?.rank).toBe('Key I');
      expect(mk1?.title).toBe('The Solar Generative Fire');

      const mk2 = APPROVED_55_CARDS.find((c) => c.position === 55);
      expect(mk2?.key).toBe('Kshetra Sphuta');
      expect(mk2?.rank).toBe('Key II');
      expect(mk2?.title).toBe('The Lunar Receptive Soil');
    });
  });

  describe('12. Demographic Personas & Gemini Safety', () => {
    it('Calculates demographic life-stages exactly as defined in PDF Specification', () => {
      const now = new Date();
      const currentYear = now.getFullYear();

      // Toddler: 2 years old
      const toddlerCtx = computeDemographicContext(`${currentYear - 2}-01-01`, 'Male');
      expect(toddlerCtx.lifeStage).toBe('Toddler');
      expect(toddlerCtx.lensDescription).toMatch(/Somatic pacing/i);

      // Child: 10 years old
      const childCtx = computeDemographicContext(`${currentYear - 10}-01-01`, 'Female');
      expect(childCtx.lifeStage).toBe('Child');
      expect(childCtx.lensDescription).toMatch(/Learning styles/i);

      // Adult Men: 30 years old, Male
      const adultMenCtx = computeDemographicContext(`${currentYear - 30}-01-01`, 'Male');
      expect(adultMenCtx.lifeStage).toBe('Adult Men');
      expect(adultMenCtx.lensDescription).toMatch(/Career & Dharma/i);

      // Adult Women: 28 years old, Female
      const adultWomenCtx = computeDemographicContext(`${currentYear - 28}-01-01`, 'Female');
      expect(adultWomenCtx.lifeStage).toBe('Adult Women');
      expect(adultWomenCtx.lensDescription).toMatch(/Career & Sovereignty/i);

      // Adult Other / Non-Binary
      const adultOtherCtx = computeDemographicContext(`${currentYear - 25}-01-01`, 'Other');
      expect(adultOtherCtx.lifeStage).toBe('Adult (Integrated)');
      expect(adultOtherCtx.lensDescription).toMatch(/Integrated balance/i);
    });

    it('Deterministic fallback explicitly marks isAiGenerated: false', async () => {
      const geminiService = new GeminiService(''); // empty API key
      const result = await geminiService.getCardInterpretation(
        'Lagna',
        'The Inception Point',
        'Dharma',
        { sign: 0, signName: 'Aries', house: 1, deg: 12.5, houseLord: 'Mars', ruler: 'Harita' },
        'Arjun',
        undefined,
        { dateOfBirth: '1995-10-25', gender: 'Male' }
      );

      expect(result).toBeDefined();
      expect(result.isAiGenerated).toBe(false);
      expect(result.deeperExplanation).toContain('Arjun');
      expect(result.sovereignAvatarPhrase).toBeDefined();
      expect(result.reflectionPrompt).toBeDefined();
      expect(result.demographicLens).toBe('Adult Men');
    });

    it('GeminiService handles HTTP 404 error gracefully and falls back to deterministic synthesis without throwing', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockRejectedValueOnce({
        response: {
          status: 404,
          statusText: 'Not Found',
          data: {
            error: {
              code: 404,
              message: 'models/gemini-old-model is not found for API version v1beta',
              status: 'NOT_FOUND',
            },
          },
        },
      });

      const geminiService = new GeminiService('test_valid_looking_key_12345', 'gemini-nonexistent');
      const placement = {
        sign: 0,
        signName: 'Aries',
        house: 1,
        deg: 10.0,
        nak: 'Ashwini',
        pada: 1,
        lord: 'Ketu',
        nadi: 'Brahma',
        ruler: 'Brahma',
        kar: { code: 'AK', name: 'Atma Karaka' },
        state: 'Direct',
        houseLord: 'Mars',
        isSovereign: true,
      };

      const result = await geminiService.getCardInterpretation(
        'Lagna',
        'The Inception Point',
        'Dharma',
        placement,
        'Arjun',
        undefined,
        { dateOfBirth: '1995-10-25', gender: 'Male' }
      );

      expect(result).toBeDefined();
      expect(result.isAiGenerated).toBe(false);
      expect(result.sovereignAvatarPhrase).toBeDefined();
      mockPost.mockRestore();
    });

    it('GeminiService generates avatar and card interpretation with isAiGenerated: true when API returns valid response', async () => {
      const mockPost = vi.spyOn(axios, 'post').mockResolvedValue({
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      avatarPhrase: 'The Sovereign Architect of the Dawn',
                      avatarSummary: 'A radiant destiny of truth and leadership awaits your conscious realization.',
                    }),
                  },
                ],
              },
            },
          ],
        },
      } as any);

      const geminiService = new GeminiService('test_key_12345678');
      const placement = {
        sign: 8,
        signName: 'Sagittarius',
        house: 9,
        deg: 15.0,
        nak: 'Mula',
        pada: 1,
        lord: 'Ketu',
        nadi: 'Sovereign',
        ruler: 'Sovereign',
        kar: { code: 'AK', name: 'Atma Karaka' },
        state: 'Direct',
        houseLord: 'Jupiter',
        isSovereign: true,
      };

      const avatar = await geminiService.generateSovereignAvatar('Jupiter', placement, 'Arjun');
      expect(avatar.isAiGenerated).toBe(true);
      expect(avatar.avatarPhrase).toBe('The Sovereign Architect of the Dawn');
      expect(avatar.avatarSummary).toContain('radiant destiny');

      // Verify header authentication was used
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/models/'),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-goog-api-key': 'test_key_12345678',
          }),
        })
      );

      mockPost.mockRestore();
    });
  });

  describe('13. Production Environment Validation & Security Policy', () => {
    it('Production rejects missing or placeholder RAZORPAY_WEBHOOK_SECRET', () => {
      const testEnv = {
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/parrotcards',
        JWT_SECRET: 'a_very_secure_random_jwt_secret_32_chars_long!!',
        RAZORPAY_KEY_ID: 'rzp_live_real_key_12345',
        RAZORPAY_KEY_SECRET: 'real_secret_1234567890',
        RAZORPAY_WEBHOOK_SECRET: 'rzp_test_webhook_secret', // Insecure test placeholder!
        ASTRONOMY_PROVIDER: 'jagannatha_hora',
        JAGANNATHA_HORA_API_URL: 'https://jagannatha-hora.example.com',
        GEMINI_API_KEY: 'valid_gemini_key_123',
      };

      const result = envSchema.safeParse(testEnv);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('RAZORPAY_WEBHOOK_SECRET'))).toBe(true);
      }
    });

    it('Production rejects test key IDs starting with rzp_test_', () => {
      const testEnv = {
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/parrotcards',
        JWT_SECRET: 'a_very_secure_random_jwt_secret_32_chars_long!!',
        RAZORPAY_KEY_ID: 'rzp_test_dummy_key_12345', // Prohibited in prod!
        RAZORPAY_KEY_SECRET: 'real_secret_1234567890',
        RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret_123456789',
        ASTRONOMY_PROVIDER: 'jagannatha_hora',
        JAGANNATHA_HORA_API_URL: 'https://jagannatha-hora.example.com',
        GEMINI_API_KEY: 'valid_gemini_key_123',
      };

      const result = envSchema.safeParse(testEnv);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes('RAZORPAY_KEY_ID'))).toBe(true);
      }
    });

    it('Production requires GEMINI_API_KEY unless ALLOW_GEMINI_FALLBACK is explicitly enabled', () => {
      // 1. Missing GEMINI_API_KEY without fallback -> fails startup
      const withoutFallback = envSchema.safeParse({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/parrotcards',
        JWT_SECRET: 'a_very_secure_random_jwt_secret_32_chars_long!!',
        RAZORPAY_KEY_ID: 'rzp_live_real_key_12345',
        RAZORPAY_KEY_SECRET: 'real_secret_1234567890',
        RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret_123456789',
        ASTRONOMY_PROVIDER: 'jagannatha_hora',
        JAGANNATHA_HORA_API_URL: 'https://jagannatha-hora.example.com',
        GEMINI_API_KEY: '', // Missing!
        ALLOW_GEMINI_FALLBACK: 'false',
      });
      expect(withoutFallback.success).toBe(false);
      if (!withoutFallback.success) {
        expect(withoutFallback.error.issues.some((i) => i.path.includes('GEMINI_API_KEY'))).toBe(true);
      }

      // 2. Missing GEMINI_API_KEY with explicit ALLOW_GEMINI_FALLBACK='true' -> succeeds with fallback permitted
      const withFallback = envSchema.safeParse({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/parrotcards',
        JWT_SECRET: 'a_very_secure_random_jwt_secret_32_chars_long!!',
        RAZORPAY_KEY_ID: 'rzp_live_real_key_12345',
        RAZORPAY_KEY_SECRET: 'real_secret_1234567890',
        RAZORPAY_WEBHOOK_SECRET: 'real_webhook_secret_123456789',
        ASTRONOMY_PROVIDER: 'jagannatha_hora',
        JAGANNATHA_HORA_API_URL: 'https://jagannatha-hora.example.com',
        GEMINI_API_KEY: '',
        ALLOW_GEMINI_FALLBACK: 'true',
      });
      expect(withFallback.success).toBe(true);
    });

    it('Rejects invalid/unsupported gender in birthDetailsSchema', () => {
      const invalidGender = birthDetailsSchema.safeParse({
        name: 'Arjun',
        gender: 'Alien',
        date: '1995-10-25',
        time: '12:00',
        place: 'Jaipur, India',
        latitude: 26.9124,
        longitude: 75.7873,
        timezone: 5.5,
      });
      expect(invalidGender.success).toBe(false);
      if (!invalidGender.success) {
        expect(invalidGender.error.issues.some((i) => i.path.includes('gender'))).toBe(true);
      }
    });
  });

  describe('14. Astronomical Placement Rendering & Entitlement Masking', () => {
    it('Correctly populates all required astronomical fields on unlocked free cards', async () => {
      const res = await request(app)
        .get(`/api/v1/decks/${createdDeckId}/cards`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const cards = res.body.data.cards;

      // Verify Lagna (Free & Unlocked)
      const lagnaCard = cards.find((c: any) => c.key === 'Lagna');
      expect(lagnaCard).toBeDefined();
      expect(lagnaCard.isFree).toBe(true);
      expect(lagnaCard.isUnlocked).toBe(true);

      const astro = lagnaCard.astronomicalPlacement;
      expect(astro).toBeDefined();
      expect(typeof astro.sign).toBe('number');
      expect(typeof astro.deg).toBe('number');
      expect(astro.signName).toBeDefined();
      expect(astro.nak).toBeDefined();
      expect(typeof astro.pada).toBe('number');
      expect(astro.lord).toBeDefined();
      expect(typeof astro.navamshaSign).toBe('number');
      expect(astro.navamshaSignName).toBeDefined();
      expect(astro.houseLord).toBeDefined();
    });

    it('Masks protected astronomical fields on locked card (Ghati Lagna)', async () => {
      const guestLockedId = 'guest_locked_test_' + Date.now();
      const profile = await BirthProfile.create({
        guestSessionId: guestLockedId,
        name: 'Locked Seeker',
        gender: 'Female',
        dateOfBirth: '1998-05-12',
        timeOfBirth: '10:00:00',
        place: 'Delhi, India',
        latitude: 28.6139,
        longitude: 77.2090,
        timezone: 5.5,
        utcDateTime: new Date('1998-05-12T04:30:00.000Z'),
      });

      const calc = await AstronomicalCalculation.create({
        profileId: profile._id,
        provider: 'mock',
        calculationVersion: '1.0.0',
        inputSnapshot: {
          date: '1998-05-12',
          time: '10:00:00',
          place: 'Delhi, India',
          latitude: 28.6139,
          longitude: 77.2090,
          timezone: 5.5,
          utcDateTime: new Date('1998-05-12T04:30:00.000Z'),
        },
        parsedPoints: {
          'Ghati Lagna': {
            sign: 3,
            signName: 'Cancer',
            deg: 15.5,
            house: 1,
            nak: 'Pushya',
            pada: 2,
            lord: 'Saturn',
            navamshaSign: 5,
            navamshaSignName: 'Virgo',
            houseLord: 'Moon',
          },
        },
        foundPointsCount: 1,
        totalPointsCount: 55,
        calculatedAt: new Date(),
      });

      const deck = await PersonalizedDeck.create({
        guestSessionId: guestLockedId,
        profileId: profile._id,
        calculationId: calc._id,
        sovereignCardKey: 'Sun',
        avatarPhrase: 'The Sovereign of Locked Test',
        avatarSummary: 'Summary',
        totalCards: 55,
        generatedAt: new Date(),
      });

      const cardDef = await CardDefinition.findOne({ key: 'Ghati Lagna' });
      await PersonalizedCard.create({
        deckId: deck._id,
        guestSessionId: guestLockedId,
        cardDefId: cardDef ? cardDef._id : new mongoose.Types.ObjectId(),
        cardId: 'DHARMA_5_5',
        suit: 'Dharma',
        suitSymbol: '♠',
        rank: '5',
        label: 'Ghati Lagna',
        key: 'Ghati Lagna',
        title: 'The Force of Impact',
        line: 'You were born to command.',
        shortSummary: 'Power to influence',
        position: 5,
        astronomicalPlacement: {
          sign: 3,
          signName: 'Cancer',
          deg: 15.5,
          house: 1,
          nak: 'Pushya',
          pada: 2,
          lord: 'Saturn',
          navamshaSign: 5,
          navamshaSignName: 'Virgo',
          houseLord: 'Moon',
          isSovereign: false,
        },
        isSovereign: false,
        isFree: false,
      });

      const res = await request(app)
        .get(`/api/v1/decks/${deck._id}/cards`)
        .set('X-Guest-Session-Id', guestLockedId);

      expect(res.status).toBe(200);
      const fetchedGhati = res.body.data.cards.find((c: any) => c.key === 'Ghati Lagna');
      expect(fetchedGhati).toBeDefined();
      expect(fetchedGhati.isFree).toBe(false);
      expect(fetchedGhati.isUnlocked).toBe(false);

      // Verify that sensitive astronomical values are cleanly masked to null
      const astro = fetchedGhati.astronomicalPlacement;
      expect(astro.sign).toBeNull();
      expect(astro.deg).toBeNull();
      expect(astro.house).toBeNull();
      expect(astro.nak).toBeNull();
      expect(astro.navamshaSign).toBeNull();
      expect(astro.navamshaSignName).toBeNull();
      expect(astro.houseLord).toBeNull();

      // Clean up
      await BirthProfile.findByIdAndDelete(profile._id);
      await AstronomicalCalculation.findByIdAndDelete(calc._id);
      await PersonalizedDeck.findByIdAndDelete(deck._id);
      await PersonalizedCard.deleteMany({ deckId: deck._id });
    });

    it('Maps stable card-key "Ghati Lagna" to astronomical calculation parsedPoints', async () => {
      const deck = await PersonalizedDeck.findById(createdDeckId);
      expect(deck).toBeDefined();

      const calc = await AstronomicalCalculation.findById(deck!.calculationId);
      expect(calc).toBeDefined();
      expect(calc!.parsedPoints).toBeDefined();

      const ghatiPoint = calc!.parsedPoints['Ghati Lagna'];
      expect(ghatiPoint).toBeDefined();
      expect(typeof ghatiPoint.sign).toBe('number');
      expect(typeof ghatiPoint.deg).toBe('number');
      expect(ghatiPoint.signName).toBeDefined();
      expect(ghatiPoint.nak).toBeDefined();
      expect(ghatiPoint.navamshaSignName).toBeDefined();
      expect(ghatiPoint.houseLord).toBeDefined();
    });

    it('Safely handles missing or null astronomical placement data without server errors', async () => {
      // Create a test card with empty placement
      const dummyCard = await PersonalizedCard.create({
        deckId: new mongoose.Types.ObjectId(createdDeckId),
        cardDefId: new mongoose.Types.ObjectId(),
        cardId: 'TEST_EMPTY_DATA',
        suit: 'MasterKey',
        suitSymbol: '✦',
        rank: 'A',
        label: 'Void Coordinate',
        key: 'Void Coordinate',
        title: 'The Unmapped Sky',
        line: 'Where charts cannot reach.',
        shortSummary: 'Test card with null placement',
        position: 99,
        astronomicalPlacement: {
          sign: null,
          deg: null,
          house: null,
          nak: null,
          isSovereign: false,
        },
        isSovereign: false,
        isFree: true,
      });

      const res = await request(app)
        .get(`/api/v1/decks/${createdDeckId}/cards`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const testCard = res.body.data.cards.find((c: any) => c.key === 'Void Coordinate');
      expect(testCard).toBeDefined();
      expect(testCard.astronomicalPlacement.sign).toBeNull();
      expect(testCard.astronomicalPlacement.deg).toBeNull();

      // Clean up dummy card
      await PersonalizedCard.findByIdAndDelete(dummyCard._id);
    });
  });

  describe('21. Super Admin Panel & Role-Based Security Suite', () => {
    let regularUserToken = '';
    let regularUserId = '';
    let adminToken = '';
    let adminUserId = '';
    let superAdminToken = '';
    let superAdminUserId = '';

    beforeAll(async () => {
      // 1. Create a regular user
      const regularUser = await User.create({
        email: `test_regular_${Date.now()}@example.com`,
        passwordHash: 'hashed_pw_test',
        name: 'Regular Seeker',
        role: 'user',
      });
      regularUserId = (regularUser._id as any).toString();
      regularUserToken = jwt.sign({ id: regularUserId, email: regularUser.email, role: 'user' }, ENV.JWT_SECRET, { expiresIn: '1h' });

      // 2. Create an admin user
      const adminPasswordHash = await bcrypt.hash('password123', 10);
      const adminUser = await User.create({
        email: `test_admin_${Date.now()}@example.com`,
        passwordHash: adminPasswordHash,
        name: 'Executive Admin',
        role: 'admin',
      });
      adminUserId = (adminUser._id as any).toString();
      adminToken = jwt.sign({ id: adminUserId, email: adminUser.email, role: 'admin' }, ENV.JWT_SECRET, { expiresIn: '1h' });

      // 3. Create a super admin user
      const superAdminUser = await User.create({
        email: `test_superadmin_${Date.now()}@example.com`,
        passwordHash: 'hashed_pw_test',
        name: 'Supreme Architect',
        role: 'superadmin',
      });
      superAdminUserId = (superAdminUser._id as any).toString();
      superAdminToken = jwt.sign({ id: superAdminUserId, email: superAdminUser.email, role: 'superadmin' }, ENV.JWT_SECRET, { expiresIn: '1h' });
    });

    afterAll(async () => {
      if (regularUserId) await User.findByIdAndDelete(regularUserId);
      if (adminUserId) await User.findByIdAndDelete(adminUserId);
      if (superAdminUserId) await User.findByIdAndDelete(superAdminUserId);
    });

    it('denies unauthenticated access to admin endpoints with HTTP 401', async () => {
      const endpoints = [
        '/api/v1/admin/stats',
        '/api/v1/admin/users',
        '/api/v1/admin/decks',
        '/api/v1/admin/cards',
        '/api/v1/admin/payments',
        '/api/v1/admin/ai-monitoring',
        '/api/v1/admin/astronomy',
        '/api/v1/admin/analytics',
        '/api/v1/admin/system',
        '/api/v1/admin/audit-logs',
      ];

      for (const endpoint of endpoints) {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    it('denies normal authenticated users access to admin endpoints with HTTP 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${regularUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Administrator privileges required/i);
    });

    it('allows authorized admin access to executive dashboard statistics with real verified data', async () => {
      const res = await request(app)
        .get('/api/v1/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();

      const { metrics, systemStatus } = res.body.data;
      expect(typeof metrics.totalUsers).toBe('number');
      expect(typeof metrics.totalDecks).toBe('number');
      expect(typeof metrics.totalCalculations).toBe('number');
      expect(typeof metrics.totalRevenueRupees).toBe('number');
      expect(typeof metrics.paidOrdersCount).toBe('number');
      expect(typeof metrics.aiInterpretationsCount).toBe('number');
      expect(typeof metrics.fallbackInterpretationsCount).toBe('number');

      // Check service health summary
      expect(systemStatus).toBeDefined();
      expect(systemStatus.database.connected).toBe(true);
    });

    it('enforces Super Admin role authorization for administrative staff management', async () => {
      // 1. Regular admin attempts to access /admins -> Expect 403 Forbidden
      const forbiddenRes = await request(app)
        .get('/api/v1/admin/admins')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.message).toMatch(/Super Administrator privileges required/i);

      // 2. Super Admin accesses /admins -> Expect 200 OK
      const allowedRes = await request(app)
        .get('/api/v1/admin/admins')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(allowedRes.status).toBe(200);
      expect(allowedRes.body.success).toBe(true);
      expect(Array.isArray(allowedRes.body.data.admins)).toBe(true);
    });

    it('supports server-side pagination, search, and role filters for users', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.users)).toBe(true);
      expect(res.body.data.users.length).toBeLessThanOrEqual(2);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(typeof res.body.data.pagination.total).toBe('number');

      // Verify passwordHash is NEVER exposed
      for (const u of res.body.data.users) {
        expect(u.passwordHash).toBeUndefined();
      }
    });

    it('validates 55-card catalog integrity and suit distribution in /api/v1/admin/cards', async () => {
      const res = await request(app)
        .get('/api/v1/admin/cards')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalCards).toBe(55);
      expect(res.body.data.isCatalogValid).toBe(true);
      expect(res.body.data.integrityCheck.duplicateKeys.length).toBe(0);
      expect(res.body.data.integrityCheck.missingPositions.length).toBe(0);

      const { suitCounts } = res.body.data;
      expect(suitCounts.Dharma).toBe(13);
      expect(suitCounts.Artha).toBe(13);
      expect(suitCounts.Kama).toBe(13);
      expect(suitCounts.Moksha).toBe(13);
      expect(suitCounts.MasterKey).toBe(3);
    });

    it('returns verified revenue, status filters, and customer details for payments (registered, guest, unavailable, deleted)', async () => {
      // 1. Registered user payment order
      const testOrder = await PaymentOrder.create({
        userId: new mongoose.Types.ObjectId(regularUserId),
        orderId: `test_ord_${Date.now()}`,
        razorpayOrderId: `rzp_ord_${Date.now()}`,
        itemType: 'DECK_PASS',
        amountPaise: 2500,
        currency: 'INR',
        status: 'PAID',
      });

      // 2. Unverified orphaned payment order (non-existent user, no audit log)
      const orphanUserId = new mongoose.Types.ObjectId();
      const orphanOrder = await PaymentOrder.create({
        userId: orphanUserId,
        orderId: `orphan_ord_${Date.now()}`,
        razorpayOrderId: `rzp_orphan_${Date.now()}`,
        itemType: 'CARD_UNLOCK',
        amountPaise: 200,
        currency: 'INR',
        status: 'PAID',
      });

      // 3. Genuine guest payment order (no userId, guestSessionId set)
      const guestOrder = await PaymentOrder.create({
        guestSessionId: 'guest_sess_admin_test_456',
        orderId: `guest_ord_${Date.now()}`,
        razorpayOrderId: `rzp_guest_${Date.now()}`,
        itemType: 'CARD_UNLOCK',
        amountPaise: 200,
        currency: 'INR',
        status: 'PAID',
      });

      // 4. Confirmed deleted account payment order (userId exists in AuditLog with DELETE_USER)
      const deletedUserId = new mongoose.Types.ObjectId();
      const auditEntry = await AuditLog.create({
        adminEmail: 'admin@parrotcards.com',
        adminName: 'Super Admin',
        action: 'DELETE_USER',
        targetType: 'USER',
        targetId: deletedUserId.toString(),
        details: {
          name: 'Confirmed Deleted User',
          email: 'deleted_user@parrotcards.com',
          role: 'SEEKER',
        },
        status: 'SUCCESS',
      });

      const deletedUserOrder = await PaymentOrder.create({
        userId: deletedUserId,
        orderId: `del_ord_${Date.now()}`,
        razorpayOrderId: `rzp_del_${Date.now()}`,
        itemType: 'DECK_PASS',
        amountPaise: 2500,
        currency: 'INR',
        status: 'PAID',
      });

      // 5. Query admin payments endpoint as authorized admin
      const res = await request(app)
        .get('/api/v1/admin/payments?status=PAID')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(typeof res.body.data.summary.totalRevenueRupees).toBe('number');
      expect(typeof res.body.data.summary.paidOrdersCount).toBe('number');
      expect(Array.isArray(res.body.data.orders)).toBe(true);

      // Verify registered user details
      const foundTestOrder = res.body.data.orders.find((o: any) => o.orderId === testOrder.orderId);
      expect(foundTestOrder).toBeDefined();
      expect(foundTestOrder.customer.name).toBe('Regular Seeker');
      expect(foundTestOrder.customer.email).toContain('@example.com');
      expect(foundTestOrder.customer.userId).toBe(regularUserId);
      expect(foundTestOrder.customer.status).toBe('REGISTERED');

      // Verify unverified/orphaned user details -> UNAVAILABLE
      const foundOrphanOrder = res.body.data.orders.find((o: any) => o.orderId === orphanOrder.orderId);
      expect(foundOrphanOrder).toBeDefined();
      expect(foundOrphanOrder.customer.name).toBe('User details unavailable');
      expect(foundOrphanOrder.customer.email).toBe('Unverified User Reference');
      expect(foundOrphanOrder.customer.status).toBe('UNAVAILABLE');

      // Verify guest seeker payment -> GUEST
      const foundGuestOrder = res.body.data.orders.find((o: any) => o.orderId === guestOrder.orderId);
      expect(foundGuestOrder).toBeDefined();
      expect(foundGuestOrder.customer.name).toBe('Guest Seeker');
      expect(foundGuestOrder.customer.status).toBe('GUEST');
      expect(foundGuestOrder.guestSessionId).toBe('guest_sess_admin_test_456');

      // Verify confirmed deleted user payment -> DELETED_ACCOUNT
      const foundDeletedOrder = res.body.data.orders.find((o: any) => o.orderId === deletedUserOrder.orderId);
      expect(foundDeletedOrder).toBeDefined();
      expect(foundDeletedOrder.customer.name).toBe('Confirmed Deleted User');
      expect(foundDeletedOrder.customer.status).toBe('DELETED_ACCOUNT');

      // 6. Security Check: Non-admin token must be rejected with 403 Forbidden
      const unauthRes = await request(app)
        .get('/api/v1/admin/payments')
        .set('Authorization', `Bearer ${regularUserToken}`);
      expect(unauthRes.status).toBe(403);

      // Clean up test orders and audit log
      await PaymentOrder.findByIdAndDelete(testOrder._id);
      await PaymentOrder.findByIdAndDelete(orphanOrder._id);
      await PaymentOrder.findByIdAndDelete(guestOrder._id);
      await PaymentOrder.findByIdAndDelete(deletedUserOrder._id);
      await AuditLog.findByIdAndDelete(auditEntry._id);
    });

    it('allows administrators to delete payment orders with cascade and audit logging', async () => {
      // 1. Create a disposable payment order and transaction
      const orderToDelete = await PaymentOrder.create({
        orderId: `disposable_ord_${Date.now()}`,
        razorpayOrderId: `rzp_disp_${Date.now()}`,
        itemType: 'CARD_UNLOCK',
        amountPaise: 200,
        currency: 'INR',
        status: 'FAILED',
      });

      // 2. Non-admin forbidden check
      const unauthRes = await request(app)
        .delete(`/api/v1/admin/payments/${orderToDelete._id}`)
        .set('Authorization', `Bearer ${regularUserToken}`);
      expect(unauthRes.status).toBe(403);

      // 3. Invalid ID format check
      const badIdRes = await request(app)
        .delete('/api/v1/admin/payments/not-a-valid-id')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(badIdRes.status).toBe(400);

      // 4. Successful admin deletion
      const deleteRes = await request(app)
        .delete(`/api/v1/admin/payments/${orderToDelete._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Verify order is gone from DB
      const checkDoc = await PaymentOrder.findById(orderToDelete._id);
      expect(checkDoc).toBeNull();

      // Verify audit log entry
      const audit = await AuditLog.findOne({
        action: 'DELETE_PAYMENT',
        targetId: orderToDelete._id.toString(),
      });
      expect(audit).toBeDefined();

      // Clean up audit entry
      if (audit) {
        await AuditLog.findByIdAndDelete(audit._id);
      }
    });

    it('provides AI monitoring metrics without exposing secret keys', async () => {
      const res = await request(app)
        .get('/api/v1/admin/ai-monitoring')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.configuration.primaryModel).toBeDefined();
      expect(typeof res.body.data.configuration.hasApiKey).toBe('boolean');
      // Ensure raw key is NOT returned
      expect(res.body.data.apiKey).toBeUndefined();
      expect(res.body.data.geminiKey).toBeUndefined();
      expect(typeof res.body.data.telemetry.aiInterpretationsCount).toBe('number');
      expect(typeof res.body.data.telemetry.fallbackInterpretationsCount).toBe('number');
      expect(typeof res.body.data.telemetry.pingLatencyMs).toBe('number');
    });

    it('provides Astronomy engine telemetry with 7-field Vedic mathematical audit', async () => {
      const res = await request(app)
        .get('/api/v1/admin/astronomy')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.provider).toBeDefined();
      expect(typeof res.body.data.telemetry.totalCalculations).toBe('number');
      expect(typeof res.body.data.telemetry.fieldIntegrityPercentage).toBe('number');
      expect(res.body.data.telemetry.requiredFieldsValidated.length).toBe(7);
    });

    it('provides system health diagnostics with memory and uptime without leaking secrets', async () => {
      const res = await request(app)
        .get('/api/v1/admin/system')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.database.status).toBe('CONNECTED');
      expect(typeof res.body.data.server.uptimeSeconds).toBe('number');
      expect(res.body.data.server.memoryMb).toBeDefined();
      // Ensure DB URI password is not leaked
      expect(res.body.data.database.host).not.toMatch(/:[^@]+@/);
    });

    it('records sensitive admin actions in AuditLog and allows querying audit trails', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.logs)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('manages admin password change securely with validation and audit logging', async () => {
      // 1. Missing fields should fail
      const missingRes = await request(app)
        .post('/api/v1/admin/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: '' });
      expect(missingRes.status).toBe(400);

      // 2. Short password should fail
      const shortRes = await request(app)
        .post('/api/v1/admin/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: 'password123', newPassword: '123' });
      expect(shortRes.status).toBe(400);

      // 3. Incorrect current password should fail
      const wrongCurrentRes = await request(app)
        .post('/api/v1/admin/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: 'WrongPasswordXYZ999', newPassword: 'BrandNewSecurePassword123' });
      expect(wrongCurrentRes.status).toBe(400);
      expect(wrongCurrentRes.body.message).toMatch(/Current password is incorrect/i);

      // 4. Valid password change should succeed
      const validRes = await request(app)
        .post('/api/v1/admin/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: 'password123', newPassword: 'BrandNewSecurePassword123' });
      expect(validRes.status).toBe(200);
      expect(validRes.body.success).toBe(true);

      // 5. Verify audit log entry was created
      const auditEntry = await AuditLog.findOne({
        action: 'CHANGE_PASSWORD',
        userId: adminUserId,
      }).sort({ createdAt: -1 });
      expect(auditEntry).toBeDefined();
      expect(auditEntry?.targetType).toBe('AUTH');
    });

    it('enforces Super Admin authorization, audit logging, and dynamic free/paid access transitions for cards', async () => {
      // 1. Locate a paid card in the catalog (e.g. Jupiter)
      const targetCard = await CardDefinition.findOne({ key: 'Jupiter' });
      expect(targetCard).toBeDefined();
      expect(targetCard?.isFreeByDefault).toBe(false);

      // 2. Unauthenticated request should be rejected with 401
      const unauthRes = await request(app)
        .patch(`/api/v1/admin/cards/${targetCard?._id}/access`)
        .send({ isFree: true });
      expect(unauthRes.status).toBe(401);

      // 3. Regular seeker (role: 'user') request should be rejected with 403
      const seekerRes = await request(app)
        .patch(`/api/v1/admin/cards/${targetCard?._id}/access`)
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({ isFree: true });
      expect(seekerRes.status).toBe(403);

      // 4. Regular admin (role: 'admin') request should be rejected with 403 (Super Admin required)
      const adminRes = await request(app)
        .patch(`/api/v1/admin/cards/${targetCard?._id}/access`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isFree: true });
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.message).toMatch(/Super Administrator privileges required/i);

      // 5. Invalid payload validation
      const badPayloadRes = await request(app)
        .patch(`/api/v1/admin/cards/${targetCard?._id}/access`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isFree: 'not-a-boolean' });
      expect(badPayloadRes.status).toBe(400);

      // 6. Super Admin transitions card from PAID -> FREE
      const makeFreeRes = await request(app)
        .patch(`/api/v1/admin/cards/${targetCard?._id}/access`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isFree: true });
      expect(makeFreeRes.status).toBe(200);
      expect(makeFreeRes.body.success).toBe(true);
      expect(makeFreeRes.body.data.card.isFreeByDefault).toBe(true);

      // Verify MongoDB persistence
      const persistedFreeCard = await CardDefinition.findById(targetCard?._id);
      expect(persistedFreeCard?.isFreeByDefault).toBe(true);

      // Verify dynamic free card keys includes Jupiter
      const freeKeysNow = await EntitlementService.getFreeCardKeys();
      expect(freeKeysNow).toContain('Jupiter');

      // Verify payment order creation is rejected for free card
      const paymentAttemptRes = await request(app)
        .post('/api/v1/payments/create-order')
        .set('Authorization', `Bearer ${regularUserToken}`)
        .send({
          itemType: 'CARD_UNLOCK',
          cardKey: 'Jupiter',
        });
      expect(paymentAttemptRes.status).toBe(400);
      expect(paymentAttemptRes.body.message).toMatch(/already free/i);

      // Verify audit log entry
      const auditLogFree = await AuditLog.findOne({
        action: 'TOGGLE_CARD_ACCESS',
        targetId: targetCard?._id.toString(),
      }).sort({ createdAt: -1 });
      expect(auditLogFree).toBeDefined();
      expect(auditLogFree?.details.newTier).toBe('FREE');
      expect(auditLogFree?.details.previousTier).toBe('PAID');

      // 7. Super Admin transitions card back from FREE -> PAID
      const makePaidRes = await request(app)
        .patch(`/api/v1/admin/cards/${targetCard?._id}/access`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ isFree: false });
      expect(makePaidRes.status).toBe(200);
      expect(makePaidRes.body.success).toBe(true);
      expect(makePaidRes.body.data.card.isFreeByDefault).toBe(false);

      // Verify MongoDB persistence
      const persistedPaidCard = await CardDefinition.findById(targetCard?._id);
      expect(persistedPaidCard?.isFreeByDefault).toBe(false);

      // Verify dynamic free card keys no longer includes Jupiter
      const freeKeysAfter = await EntitlementService.getFreeCardKeys();
      expect(freeKeysAfter).not.toContain('Jupiter');

      // Verify audit log for switching back to PAID
      const auditLogPaid = await AuditLog.findOne({
        action: 'TOGGLE_CARD_ACCESS',
        targetId: targetCard?._id.toString(),
      }).sort({ createdAt: -1 });
      expect(auditLogPaid).toBeDefined();
      expect(auditLogPaid?.details.newTier).toBe('PAID');
      expect(auditLogPaid?.details.previousTier).toBe('FREE');

      // 8. Default baseline cards check
      const baselineFreeKeys = await EntitlementService.getFreeCardKeys();
      expect(baselineFreeKeys).toContain('Lagna');
      expect(baselineFreeKeys).toContain('Sun');
      expect(baselineFreeKeys).toContain('Moon');
    });
  });
});



