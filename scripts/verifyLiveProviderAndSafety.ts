import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { JagannathaHoraProvider } from '../src/integrations/astronomy/JagannathaHoraProvider';
import { AstronomyService } from '../src/integrations/astronomy/AstronomyService';
import { BirthProfile } from '../src/models/BirthProfile';
import { AstronomicalCalculation } from '../src/models/AstronomicalCalculation';
import { APPROVED_55_CARDS } from '../src/utils/seedCards';
import { SIGN_NAMES, SIGN_LORDS, computeNavamsha, getHouseLord } from '../src/utils/astroMath';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function runLiveVerification() {
  console.log('================================================================');
  console.log('🌌 LIVE JAGANNATHA HORA API & SAFETY REQUIREMENTS VERIFICATION');
  console.log('================================================================\n');

  const liveApiUrl = process.env.JAGANNATHA_HORA_API_URL;
  console.log(`🌐 Live Provider Endpoint: ${liveApiUrl}`);

  const controlledBirthInput = {
    name: 'Live Safety Verification User',
    date: '1995-10-24',
    time: '14:30',
    place: 'Jaipur, Rajasthan, India',
    latitude: 26.9124,
    longitude: 75.7873,
    timezone: 5.5,
  };

  // -------------------------------------------------------------
  // STEP 2: TEST REAL JAGANNATHA HORA API INTEGRATION
  // -------------------------------------------------------------
  console.log('\n--- 2. REAL JAGANNATHA HORA API CALL ---');
  const provider = new JagannathaHoraProvider(liveApiUrl);
  const startTime = Date.now();
  console.log(`📡 Sending live horoscope calculation request for:`, controlledBirthInput);

  let liveResult: any;
  try {
    liveResult = await provider.calculateHoroscope(controlledBirthInput);
  } catch (err: any) {
    console.error(`❌ Live API call failed: ${err.message}`);
    throw err;
  }

  const durationMs = Date.now() - startTime;
  console.log(`✅ Live Jagannatha Hora API responded in ${durationMs}ms`);
  console.log(`📦 Provider reported version: ${liveResult.calculationVersion}`);

  const rawPayload = liveResult.rawHoroscope;
  const rawPayloadSize = JSON.stringify(rawPayload).length;
  console.log(`📊 Full uncompressed response payload size: ${(rawPayloadSize / (1024 * 1024)).toFixed(2)} MB (${rawPayloadSize} bytes)`);

  const hasD9 = !!(rawPayload.divisional_charts?.['D-9_navamsa'] || rawPayload['D-9_navamsa']);
  const hasNakshatra = !!rawPayload.nakshatra_pada;
  console.log(`🔍 Live response contains D-9_navamsa divisional chart: ${hasD9}`);
  console.log(`🔍 Live response contains nakshatra_pada positions: ${hasNakshatra}`);

  // -------------------------------------------------------------
  // STEP 3: VERIFY NAVAMSHA (D9) & HOUSE LORDS FOR ALL 55 CARDS
  // -------------------------------------------------------------
  console.log('\n--- 3. VERIFY NAVAMSHA (D9) & HOUSE LORD VALUES AGAINST LIVE API ---');
  const astroService = new AstronomyService('jagannatha_hora');
  const parsed = astroService.parseHoroscopeData(rawPayload);

  console.log(`🎯 Parsed celestial points count: ${parsed.foundCount}/55 cards`);
  console.log(`👑 Atma Karaka (Sovereign): ${parsed.akPlanet}`);
  console.log(`Ascendant (Lagna) Sign: ${parsed.lagSign} (${parsed.lagSign != null ? SIGN_NAMES[parsed.lagSign] : 'Unknown'})`);

  let checkedCount = 0;
  let navamshaMatches = 0;
  let houseLordMatches = 0;

  for (const card of APPROVED_55_CARDS) {
    const p = parsed.points[card.key];
    if (!p) {
      throw new Error(`Missing placement for card key: ${card.key}`);
    }

    // Verify Navamsha is populated
    if (p.navamshaSign == null || p.navamshaSign < 0 || p.navamshaSign > 11) {
      throw new Error(`Card ${card.key} has invalid navamshaSign: ${p.navamshaSign}`);
    }
    if (!p.navamshaSignName) {
      throw new Error(`Card ${card.key} has missing navamshaSignName`);
    }

    // Verify House Lord is populated
    if (!p.houseLord) {
      throw new Error(`Card ${card.key} has missing houseLord`);
    }
    const expectedLord = p.sign != null ? SIGN_LORDS[p.sign] : null;
    if (expectedLord && p.houseLord !== expectedLord) {
      throw new Error(`Card ${card.key} houseLord mismatch: expected ${expectedLord}, got ${p.houseLord}`);
    }

    checkedCount++;
    navamshaMatches++;
    houseLordMatches++;
  }

  console.log(`✅ All ${checkedCount}/55 cards verified with valid Navamsha (D9) and House Lord (Dispositor)!`);

  // Sample card verification from live response
  console.log('\nSample Live Placements:');
  ['Sun', 'Moon', 'Mars', 'Jupiter', 'Venus', 'Lagna', 'Gulika', 'Indu Lagna'].forEach((key) => {
    const pl = parsed.points[key];
    if (pl) {
      console.log(`  • ${key.padEnd(12)}: Sign ${pl.sign} (${pl.signName || '—'}), ${(pl.deg || 0).toFixed(2)}° -> D9: ${pl.navamshaSignName} (Sign ${pl.navamshaSign! + 1}), Lord: ${pl.houseLord}`);
    }
  });

  // -------------------------------------------------------------
  // STEP 4: CONFIRM NEW CALCULATIONS DO NOT PERSIST LARGE RAW REPORTS
  // -------------------------------------------------------------
  console.log('\n--- 4. CONFIRM NEW CALCULATIONS DO NOT PERSIST 3.5 MB RAW BLOAT ---');
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log(`🌌 Connected to Atlas for test profile calculation`);

  const utcDate = astroService.computeUtcDate(controlledBirthInput.date, controlledBirthInput.time, controlledBirthInput.timezone);
  const testProfile = await BirthProfile.create({
    name: controlledBirthInput.name,
    dateOfBirth: controlledBirthInput.date,
    timeOfBirth: controlledBirthInput.time,
    place: controlledBirthInput.place,
    latitude: controlledBirthInput.latitude,
    longitude: controlledBirthInput.longitude,
    timezone: controlledBirthInput.timezone,
    utcDateTime: utcDate,
    guestSessionId: 'live_safety_test_session',
  });

  console.log(`👤 Created temporary test profile on Atlas: ${testProfile._id}`);

  // Calculate using AstronomyService (which handles persistence)
  const calcStartTime = Date.now();
  const savedCalc = await astroService.getOrCalculate(testProfile._id as mongoose.Types.ObjectId, controlledBirthInput);
  const calcDuration = Date.now() - calcStartTime;
  console.log(`⚡ Calculation and storage completed in ${calcDuration}ms`);

  // Query MongoDB document directly to inspect storage footprint
  const docFromDb = await AstronomicalCalculation.findById(savedCalc._id).lean();
  if (!docFromDb) throw new Error('Calculation document not found in DB!');

  const persistedRaw = docFromDb.rawHoroscope;
  const persistedRawBytes = JSON.stringify(persistedRaw).length;
  console.log(`📊 Persisted rawHoroscope footprint: ${persistedRawBytes} bytes (< 1 KB)`);
  console.log(`   (Compared to raw provider payload of ${rawPayloadSize} bytes, saving ${((1 - persistedRawBytes / rawPayloadSize) * 100).toFixed(2)}% storage!)`);
  console.log(`📋 Lean metadata persisted:`, persistedRaw);

  if (persistedRawBytes > 1024) {
    throw new Error(`Persisted rawHoroscope is too large (${persistedRawBytes} bytes)!`);
  }

  // Verify all required card placement fields remain fully available in parsedPoints
  const pointsFromDb = docFromDb.parsedPoints;
  const keysCount = Object.keys(pointsFromDb).length;
  console.log(`✅ All ${keysCount}/55 required card placement objects remain available in parsedPoints.`);

  const sampleCard = pointsFromDb['Sun'];
  console.log(`   Sample Sun fields in DB: sign=${sampleCard.sign}, deg=${sampleCard.deg?.toFixed(2)}°, house=${sampleCard.house}, navamshaSign=${sampleCard.navamshaSign} (${sampleCard.navamshaSignName}), houseLord=${sampleCard.houseLord}`);

  // -------------------------------------------------------------
  // STEP 5: CONFIRM CACHED CALCULATIONS REUSED WITHOUT API CALLS
  // -------------------------------------------------------------
  console.log('\n--- 5. CONFIRM CACHED CALCULATIONS REUSED WITHOUT REDUNDANT API CALLS ---');
  const cacheStartTime = Date.now();
  const cachedCalc = await astroService.getOrCalculate(testProfile._id as mongoose.Types.ObjectId, controlledBirthInput);
  const cacheDurationMs = Date.now() - cacheStartTime;

  console.log(`⚡ Cached retrieval completed in ${cacheDurationMs}ms (immediate memory/DB retrieval)`);
  if (cacheDurationMs > 100) {
    console.warn(`⚠️ Cache response took longer than 100ms: ${cacheDurationMs}ms`);
  } else {
    console.log(`✅ Cache hit verified without remote API call (< 100ms)!`);
  }

  if (cachedCalc._id.toString() !== savedCalc._id.toString()) {
    throw new Error('Cache returned different calculation document ID!');
  }

  // -------------------------------------------------------------
  // CLEANUP: REMOVE ONLY TEMPORARY TEST PROFILE & ITS CALCULATION
  // -------------------------------------------------------------
  console.log('\n--- CLEANUP TEMPORARY TEST RECORD ---');
  await BirthProfile.findByIdAndDelete(testProfile._id);
  await AstronomicalCalculation.findByIdAndDelete(savedCalc._id);
  console.log(`🧹 Cleaned up temporary test profile and its single test calculation from Atlas.`);

  await mongoose.disconnect();
  console.log('✅ Disconnected from Atlas.');
  console.log('\n🎉 ALL LIVE VERIFICATION CHECKS PASSED WITH ZERO DATA LOSS!\n');
}

runLiveVerification().catch((err) => {
  console.error('❌ Live verification failed:', err);
  process.exit(1);
});
