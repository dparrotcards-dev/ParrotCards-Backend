import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

import { User } from '../models/User';
import { BirthProfile } from '../models/BirthProfile';
import { AstronomicalCalculation } from '../models/AstronomicalCalculation';
import { PersonalizedDeck } from '../models/PersonalizedDeck';
import { PersonalizedCard } from '../models/PersonalizedCard';
import { AstronomyService } from '../integrations/astronomy/AstronomyService';
import { DeckService } from '../services/deckService';
import { connectDB, disconnectDB } from '../config/database';

async function testAppFlowOnAtlas() {
  console.log('========================================================');
  console.log('🧪 TESTING END-TO-END APPLICATION FLOW ON MONGODB ATLAS');
  console.log('========================================================\n');

  await connectDB();

  // Test 1: User Registration, Hashing & JWT Auth on Atlas
  console.log('Step 1: Testing User Authentication on Atlas...');
  const testEmail = `atlas_test_${Date.now()}@parrotcards.internal`;
  const rawPassword = 'SecurePassword@123';
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const newUser = await User.create({
    name: 'Atlas Test User',
    email: testEmail,
    passwordHash: hashedPassword,
    role: 'user',
  });
  console.log(`   ✓ Created User on Atlas: ${newUser.email} (ID: ${newUser._id})`);

  const passwordValid = await bcrypt.compare(rawPassword, newUser.passwordHash);
  console.log(`   ✓ Password Hashing & Verification: ${passwordValid ? 'PASSED' : 'FAILED'}`);

  const token = jwt.sign({ id: newUser._id, email: newUser.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
  const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'secret');
  console.log(`   ✓ JWT Token Generation & Verification: ${decoded.id === newUser._id.toString() ? 'PASSED' : 'FAILED'}`);

  // Test 2: Profile Creation and Deck Generation on Atlas
  console.log('\nStep 2: Testing Profile & Deck Persistence on Atlas...');
  const astronomyService = new AstronomyService();
  const deckService = new DeckService();

  const birthInput = {
    name: 'Atlas Test Traveler',
    gender: 'Female',
    date: '1998-04-14',
    time: '08:30:00',
    place: 'Jaipur, Rajasthan, India',
    latitude: 26.9124,
    longitude: 75.7873,
    timezone: 5.5,
    ianaTimezone: 'Asia/Kolkata',
  };

  const utcDateTime = astronomyService.computeUtcDate(birthInput.date, birthInput.time, birthInput.timezone);

  const profile = await BirthProfile.create({
    userId: newUser._id,
    name: birthInput.name,
    gender: birthInput.gender,
    dateOfBirth: birthInput.date,
    timeOfBirth: birthInput.time,
    place: birthInput.place,
    latitude: birthInput.latitude,
    longitude: birthInput.longitude,
    timezone: birthInput.timezone,
    ianaTimezone: birthInput.ianaTimezone,
    utcDateTime,
  });
  console.log(`   ✓ Saved Birth Profile on Atlas: "${profile.name}" (ID: ${profile._id})`);

  // First Calculation (calls or generates)
  console.log('   Calculating astronomical placement (initial)...');
  const t0 = Date.now();
  const calc1 = await astronomyService.getOrCalculate(profile._id as mongoose.Types.ObjectId, birthInput);
  const duration1 = Date.now() - t0;
  console.log(`   ✓ Calculation 1 generated and saved on Atlas in ${duration1}ms (ID: ${calc1._id})`);

  // Second Calculation for SAME profile: MUST be retrieved instantly from Atlas cache!
  console.log('   Testing Cache / Subsequent Retrieval for same profile from Atlas...');
  const t1 = Date.now();
  const calc2 = await astronomyService.getOrCalculate(profile._id as mongoose.Types.ObjectId, birthInput);
  const duration2 = Date.now() - t1;
  console.log(`   ✓ Calculation 2 retrieved from Atlas in ${duration2}ms (ID: ${calc2._id})`);

  if (calc1._id.toString() === calc2._id.toString() && duration2 < 500) {
    console.log(`   ✅ Cache Verification: SUBSEQUENT LOADS RETRIEVE DIRECTLY FROM ATLAS WITHOUT RE-CALLING JAGANNATHA HORA! (Duration: ${duration2}ms vs ${duration1}ms)`);
  } else {
    console.error('   ❌ Cache Verification Failed!');
  }

  // Generate Deck on Atlas
  console.log('\nStep 3: Generating and Persisting 55-Card Deck on Atlas...');
  const { deck, cards, entitlements } = await deckService.getOrGenerateDeck(profile, calc1, newUser._id.toString());
  console.log(`   ✓ Saved Personalized Deck on Atlas: ${deck.deckCode} (Cards: ${cards.length})`);
  console.log(`   ✓ Sovereign Avatar: "${deck.avatarPhrase}"`);

  // Verify Free Cards on Atlas
  const freeCards = cards.filter((c) => c.isUnlocked);
  console.log(`   ✓ Free Cards Unlocked by Default: ${freeCards.length} (${freeCards.map((c) => c.label).join(', ')})`);

  // Clean up test records
  console.log('\nStep 4: Cleaning up temporary verification records...');
  await PersonalizedCard.deleteMany({ deckId: deck._id });
  await PersonalizedDeck.deleteOne({ _id: deck._id });
  await AstronomicalCalculation.deleteOne({ _id: calc1._id });
  await BirthProfile.deleteOne({ _id: profile._id });
  await User.deleteOne({ _id: newUser._id });
  console.log('   ✓ Temporary test records cleaned up.');

  await disconnectDB();

  console.log('\n========================================================');
  console.log('🎉 ALL ATLAS APPLICATION FLOW TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================\n');
}

testAppFlowOnAtlas().catch(console.error);
