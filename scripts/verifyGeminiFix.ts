import mongoose from 'mongoose';
import { GeminiService } from '../src/integrations/gemini/GeminiService';
import { ENV } from '../src/config/env';
import { IAstronomicalPlacement } from '../src/types';

async function verify() {
  console.log('--- GEMINI SERVICE LIVE VERIFICATION ---');
  console.log('Environment GEMINI_MODEL:', ENV.GEMINI_MODEL);
  console.log('API Key configured:', !!ENV.GEMINI_API_KEY && ENV.GEMINI_API_KEY.length > 10);

  // Connect to isolated in-memory or test database for cache checks
  await mongoose.connect(ENV.MONGODB_TEST_URI);
  console.log('Connected to test DB for cache isolation.');

  const geminiService = new GeminiService();

  const mockPlacement1: IAstronomicalPlacement = {
    sign: 8,
    signName: 'Sagittarius',
    house: 9,
    deg: 14.2,
    nak: 'Purva Ashadha',
    pada: 1,
    lord: 'Venus',
    nadi: 'Amrita',
    ruler: 'Amrita',
    kar: { code: 'AK', name: 'Atma Karaka' },
    state: 'Direct',
    houseLord: 'Jupiter',
    isSovereign: true,
  };

  // 1. Test Sovereign Avatar Generation
  console.log('\n[1/3] Testing generateSovereignAvatar with live Gemini API...');
  const avatarResult = await geminiService.generateSovereignAvatar(
    'Jupiter',
    mockPlacement1,
    'Arjun Seeker',
    '1990-05-15',
    'male'
  );

  console.log('Avatar Result:', {
    avatarPhrase: avatarResult.avatarPhrase,
    avatarSummary: avatarResult.avatarSummary.substring(0, 80) + '...',
    isAiGenerated: avatarResult.isAiGenerated,
  });

  if (avatarResult.isAiGenerated !== true) {
    throw new Error('Expected avatar to be AI generated with valid configured key, got fallback!');
  }

  // 2. Test Deep Card Interpretation
  console.log('\n[2/3] Testing getCardInterpretation with live Gemini API...');
  const mockPlacement2: IAstronomicalPlacement = {
    sign: 0,
    signName: 'Aries',
    house: 1,
    deg: 15.0,
    houseLord: 'Mars',
    nak: 'Bharani',
    pada: 2,
    lord: 'Venus',
    nadi: 'Harita',
    ruler: 'Harita',
    kar: { code: 'PK', name: 'Putra Karaka' },
    state: 'Direct',
    navamshaSignName: 'Virgo',
    isSovereign: true,
  };

  const cardResult = await geminiService.getCardInterpretation(
    'Lagna',
    'The Inception Point',
    'Dharma & Purpose',
    mockPlacement2,
    'Arjun Seeker',
    undefined,
    { dateOfBirth: '1990-05-15', gender: 'male' }
  );

  console.log('Card Result:', {
    sovereignAvatarPhrase: cardResult.sovereignAvatarPhrase,
    deeperExplanation: cardResult.deeperExplanation.substring(0, 80) + '...',
    dharmaConnection: cardResult.dharmaConnection.substring(0, 60) + '...',
    isAiGenerated: cardResult.isAiGenerated,
    demographicLens: cardResult.demographicLens,
  });

  if (cardResult.isAiGenerated !== true) {
    throw new Error('Expected card interpretation to be AI generated with valid configured key, got fallback!');
  }

  // 3. Test Fallback with Empty/Invalid Key
  console.log('\n[3/3] Testing deterministic fallback behavior with empty key...');
  const fallbackService = new GeminiService('');
  const fallbackResult = await fallbackService.getCardInterpretation(
    'Sun',
    'The Solar Core',
    'Vitality & Dharma',
    mockPlacement2,
    'Fallback Seeker',
    undefined,
    { dateOfBirth: '2015-06-20', gender: 'female' }
  );

  console.log('Fallback Result:', {
    sovereignAvatarPhrase: fallbackResult.sovereignAvatarPhrase,
    isAiGenerated: fallbackResult.isAiGenerated,
    demographicLens: fallbackResult.demographicLens,
  });

  if (fallbackResult.isAiGenerated !== false) {
    throw new Error('Expected fallback interpretation to have isAiGenerated === false!');
  }

  await mongoose.disconnect();
  console.log('\n🎉 ALL 3 VERIFICATIONS PASSED SUCCESSFULLY!');
}

verify().catch(async (err) => {
  console.error('Verification failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
