import axios from 'axios';
import crypto from 'crypto';
import { ENV } from '../../config/env';
import { CardInterpretation } from '../../models/CardInterpretation';
import { IAstronomicalPlacement } from '../../types';

export interface CardInterpretationOutput {
  sovereignAvatarPhrase?: string;
  deeperExplanation: string;
  reflectionPrompt: string;
  dharmaConnection: string;
  practicalAction: string;
  isAiGenerated: boolean;
  demographicLens?: string;
}

export interface DemographicContext {
  age?: number;
  lifeStage: 'Toddler' | 'Child' | 'Adult Men' | 'Adult Women' | 'Adult (Integrated)' | 'General';
  lensDescription: string;
  gender?: string;
}

/**
 * Computes life-stage persona exactly as defined in PDF Specification Part II Section 4:
 * - Toddlers: 0–4 years (Somatic pacing, sensory safety, physiological nervous system regulation)
 * - Children: 5–17 years (Learning styles, talent germination, cognitive focus, emotional boundary development)
 * - Adult Men: 18+ years (Sovereign posture, alignment of purpose, sustainable wealth, career & Dharma lens)
 * - Adult Women: 18+ years (Cyclical balance, intuitive power, regenerative abundance, career & Sovereignty lens)
 * - Adult (Integrated): Other/Non-binary/unspecified
 */
export function computeDemographicContext(dateOfBirth?: string, gender?: string): DemographicContext {
  if (!dateOfBirth) {
    return {
      lifeStage: 'General',
      lensDescription: 'Sovereign personal alignment, conscious agency, and dharma realization.',
      gender,
    };
  }

  const birthDate = new Date(dateOfBirth);
  if (isNaN(birthDate.getTime())) {
    return {
      lifeStage: 'General',
      lensDescription: 'Sovereign personal alignment, conscious agency, and dharma realization.',
      gender,
    };
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  const normalizedGender = (gender || '').trim().toLowerCase();

  // 1. Toddlers: 0–4 years
  if (age >= 0 && age <= 4) {
    return {
      age,
      lifeStage: 'Toddler',
      lensDescription: 'Somatic pacing, sensory safety, physical nervous system regulation, and innate elemental temperament.',
      gender,
    };
  }

  // 2. Children: 5–17 years
  if (age >= 5 && age <= 17) {
    return {
      age,
      lifeStage: 'Child',
      lensDescription: 'Learning styles, talent germination, cognitive focus, emotional boundary development, and intrinsic motivation.',
      gender,
    };
  }

  // 3. Adults: 18+ years
  if (normalizedGender === 'male') {
    return {
      age,
      lifeStage: 'Adult Men',
      lensDescription: 'Sovereign posture, alignment of purpose, sustainable wealth generation, emotional integration, and focused duty (Career & Dharma lens).',
      gender,
    };
  }

  if (normalizedGender === 'female') {
    return {
      age,
      lifeStage: 'Adult Women',
      lensDescription: 'Cyclical balance, intuitive power, regenerative abundance, structural leadership, and sovereign boundary protection (Career & Sovereignty lens).',
      gender,
    };
  }

  return {
    age,
    lifeStage: 'Adult (Integrated)',
    lensDescription: 'Integrated balance of purpose, conscious agency, emotional clarity, and sovereign boundary protection.',
    gender,
  };
}

function getOrdinalHouse(h: number | null | undefined): string {
  if (!h) return 'the Ascendant';
  const suffixes = ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'];
  const v = h % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : suffixes[h % 10] || 'th';
  return `${h}${suffix} House`;
}

export class GeminiService {
  private apiKey: string;
  private model: string;
  private fallbackModel: string;
  private baseUrl: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = (apiKey !== undefined ? apiKey : (ENV.GEMINI_API_KEY || '')).trim();
    this.model = model || ENV.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    this.fallbackModel = this.model === 'gemini-3.5-flash-lite' ? 'gemini-3.5-flash' : 'gemini-3.5-flash-lite';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Log safe, actionable Gemini API errors without exposing API keys or secrets
   */
  private logGeminiError(action: string, error: any, targetModel: string): void {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    const apiMessage = error.response?.data?.error?.message;
    const code = error.code || error.message;
    console.warn(
      `⚠️ Gemini API [${action}] failed (model: ${targetModel}, HTTP ${status ?? 'N/A'}${statusText ? ' ' + statusText : ''}): ${apiMessage || code}`
    );
  }

  /**
   * Safely strip markdown code blocks and parse JSON
   */
  private cleanAndParseJson<T>(rawText: string | null | undefined): T | null {
    if (!rawText) return null;
    const sanitized = rawText
      .replace(/```(?:json)?/gi, '')
      .replace(/```/g, '')
      .trim();
    try {
      return JSON.parse(sanitized) as T;
    } catch {
      return null;
    }
  }

  /**
   * Send generateContent request to Gemini API with official x-goog-api-key header auth
   */
  private async executeGenerateContent(
    prompt: string,
    temperature: number = 0.65,
    timeoutMs: number = 12000
  ): Promise<string | null> {
    const modelsToAttempt = [this.model];
    if (this.fallbackModel && this.fallbackModel !== this.model) {
      modelsToAttempt.push(this.fallbackModel);
    }

    let lastError: any = null;

    for (const candidateModel of modelsToAttempt) {
      try {
        const endpoint = `${this.baseUrl}/models/${candidateModel}:generateContent`;
        const res = await axios.post(
          endpoint,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature,
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': this.apiKey,
            },
            timeout: timeoutMs,
          }
        );

        const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        }
      } catch (err: any) {
        lastError = err;
        this.logGeminiError('executeGenerateContent', err, candidateModel);
      }
    }

    if (lastError) {
      throw lastError;
    }
    return null;
  }

  /**
   * Create deterministic cache hash from cardKey, astronomical parameters and demographic persona
   */
  public generateCacheHash(
    cardKey: string,
    placement: IAstronomicalPlacement,
    userName: string,
    demographic?: DemographicContext
  ): string {
    const stage = demographic?.lifeStage || 'General';
    const raw = `${cardKey}_${placement.sign}_${placement.house}_${placement.nak}_${placement.deg}_${userName}_${stage}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Generate or retrieve cached deep interpretation for a specific card
   */
  public async getCardInterpretation(
    cardKey: string,
    cardTitle: string,
    cardTheme: string,
    placement: IAstronomicalPlacement,
    userName: string,
    userId?: string,
    demographicInput?: { dateOfBirth?: string; gender?: string; demographicContext?: DemographicContext }
  ): Promise<CardInterpretationOutput> {
    const demographic =
      demographicInput?.demographicContext ||
      computeDemographicContext(demographicInput?.dateOfBirth, demographicInput?.gender);

    const cacheHash = this.generateCacheHash(cardKey, placement, userName, demographic);

    // 1. Check database cache first
    const cached = await CardInterpretation.findOne({ cacheHash, cardKey });
    if (cached) {
      return {
        sovereignAvatarPhrase: cached.sovereignAvatarPhrase,
        deeperExplanation: cached.deeperExplanation,
        reflectionPrompt: cached.reflectionPrompt,
        dharmaConnection: cached.dharmaConnection,
        practicalAction: cached.practicalAction,
        isAiGenerated: cached.isAiGenerated,
        demographicLens: demographic.lifeStage,
      };
    }

    // 2. Call Gemini API if key is configured
    if (this.apiKey && this.apiKey.trim().length > 5) {
      try {
        const aiResult = await this.callGeminiApi(
          cardKey,
          cardTitle,
          cardTheme,
          placement,
          userName,
          demographic
        );
        await CardInterpretation.create({
          userId: userId ? userId : undefined,
          cardKey,
          cacheHash,
          sovereignAvatarPhrase: aiResult.sovereignAvatarPhrase,
          deeperExplanation: aiResult.deeperExplanation,
          reflectionPrompt: aiResult.reflectionPrompt,
          dharmaConnection: aiResult.dharmaConnection,
          practicalAction: aiResult.practicalAction,
          isAiGenerated: true,
        });
        return aiResult;
      } catch (err: any) {
        console.warn('⚠️ Gemini interpretation failed; engaging rule-based cosmic synthesis:', err.message);
      }
    }

    // 3. Fallback: Generate personalized astronomical synthesis using the user's real chart facts and demographic lens
    const fallback = this.generateDeterministicSynthesis(
      cardKey,
      cardTitle,
      cardTheme,
      placement,
      userName,
      demographic
    );

    await CardInterpretation.create({
      userId: userId ? userId : undefined,
      cardKey,
      cacheHash,
      sovereignAvatarPhrase: fallback.sovereignAvatarPhrase,
      deeperExplanation: fallback.deeperExplanation,
      reflectionPrompt: fallback.reflectionPrompt,
      dharmaConnection: fallback.dharmaConnection,
      practicalAction: fallback.practicalAction,
      isAiGenerated: false,
    });

    return fallback;
  }

  /**
   * Generate Sovereign Avatar Phrase for user's Atma Karaka planet & placement
   */
  public async generateSovereignAvatar(
    akPlanet: string,
    akPlacement: IAstronomicalPlacement,
    userName: string,
    dateOfBirth?: string,
    gender?: string
  ): Promise<{ avatarPhrase: string; avatarSummary: string; isAiGenerated: boolean }> {
    const sign = akPlacement.signName || 'Sacred Space';
    const house = getOrdinalHouse(akPlacement.house);
    const nak = akPlacement.nak ? `under the stars of ${akPlacement.nak}` : '';
    const demographic = computeDemographicContext(dateOfBirth, gender);

    if (this.apiKey && this.apiKey.trim().length > 5) {
      try {
        const prompt = `You are the master astrological oracle for Parrot Cards. 
Generate a Sovereign Avatar Phrase and poetic 2-sentence summary for a seeker named ${userName}.
Demographic Context: ${demographic.lifeStage} (${demographic.age != null ? demographic.age + ' years old' : 'unspecified age'}), Lens: ${demographic.lensDescription}.
Their soul planet (Atma Karaka) is ${akPlanet}, placed in ${sign} in the ${house} ${nak}.
Dispositor / House Lord: ${akPlacement.houseLord || 'Independent'}.
Nadi Amsha frequency: ${akPlacement.ruler || akPlacement.nadi || 'Sovereign Nexus'}.

Respond strictly in JSON format with two keys:
"avatarPhrase": a majestic, 4-8 word title (e.g. "The Radiant Architect of the Ninth Horizon"),
"avatarSummary": an inspiring 2-sentence synthesis of their sovereign destiny.`;

        const text = await this.executeGenerateContent(prompt, 0.7, 12000);
        const parsed = this.cleanAndParseJson<{ avatarPhrase?: string; avatarSummary?: string }>(text);
        if (parsed?.avatarPhrase) {
          return {
            avatarPhrase: parsed.avatarPhrase,
            avatarSummary: parsed.avatarSummary || '',
            isAiGenerated: true,
          };
        }
      } catch (e: any) {
        console.warn('⚠️ Gemini sovereign avatar call failed, using deterministic synthesis:', e.message);
      }
    }

    // High-quality deterministic generation from chart placement and demographic context
    const avatarPhrase = `The ${akPlanet} Sovereign of ${sign}: Guardian of the ${house}`;
    const avatarSummary = `With ${akPlanet} crowned as your Atma Karaka in ${sign}, your soul came into this incarnation to master the spiritual lessons of ${house} through the lens of ${demographic.lifeStage}. You hold the authority to lead through unwavering inner integrity.`;
    return { avatarPhrase, avatarSummary, isAiGenerated: false };
  }

  private async callGeminiApi(
    cardKey: string,
    cardTitle: string,
    cardTheme: string,
    placement: IAstronomicalPlacement,
    userName: string,
    demographic: DemographicContext
  ): Promise<CardInterpretationOutput> {
    const prompt = `You are the Vedic wisdom engine for Parrot Cards.
Provide a deep, personalized card reading for ${userName}.
Card: "${cardTitle}" (${cardKey}) - Theme: ${cardTheme}.
Demographic Lens: ${demographic.lifeStage} (${demographic.age != null ? demographic.age + ' years old' : 'unspecified age'}, Gender: ${demographic.gender || 'unspecified'}).
Demographic Focus: ${demographic.lensDescription}.

Astronomical Chart Facts for this point in their birth chart:
- Sign: ${placement.signName || 'Unknown'} (Sign index: ${placement.sign})
- House: ${placement.house || 'First House'}
- Degree: ${placement.deg != null ? placement.deg.toFixed(2) : 'Exact'}°
- House Lord (Dispositor): ${placement.houseLord || 'Natural Ruler'}
- Navamsha Rashi (D9): ${placement.navamshaSignName || 'Harmonic D9'}
- Nakshatra: ${placement.nak || 'Cosmic'} (Pada ${placement.pada || 1}, Lord: ${placement.lord || 'Self'})
- Nadi Amsa Ruler (D150): ${placement.ruler || placement.nadi || 'Sacred Harmonic'}
- Sovereign Status: ${placement.isSovereign ? 'Yes (Atma Karaka / Sovereign Point)' : 'Harmonic Alignment'}

Respond with STRICT JSON containing:
{
  "sovereignAvatarPhrase": "A poetic 4-6 word moniker connecting this placement to the seeker",
  "deeperExplanation": "2-3 rich paragraphs explaining how this astronomical placement influences their path through their specific demographic lens (${demographic.lifeStage})",
  "reflectionPrompt": "One piercing, transformative self-inquiry question grounded in their current life stage",
  "dharmaConnection": "A concise paragraph explaining how this connects to their Purushartha purpose",
  "practicalAction": "One concrete grounded action they can practice today"
}`;

    const text = await this.executeGenerateContent(prompt, 0.65, 12000);
    const parsed = this.cleanAndParseJson<any>(text) || {};

    return {
      sovereignAvatarPhrase: parsed.sovereignAvatarPhrase || `The Weaver of ${placement.signName || cardTitle}`,
      deeperExplanation: parsed.deeperExplanation || 'A powerful cosmic placement anchoring your chart.',
      reflectionPrompt: parsed.reflectionPrompt || 'What is this placement asking you to surrender or claim?',
      dharmaConnection: parsed.dharmaConnection || 'Aligns your natural action with your higher spiritual purpose.',
      practicalAction: parsed.practicalAction || 'Take 5 minutes in silent contemplation today.',
      isAiGenerated: true,
      demographicLens: demographic.lifeStage,
    };
  }

  private generateDeterministicSynthesis(
    cardKey: string,
    cardTitle: string,
    cardTheme: string,
    placement: IAstronomicalPlacement,
    userName: string,
    demographic: DemographicContext
  ): CardInterpretationOutput {
    const sign = placement.signName || 'the Cosmic Zodiac';
    const house = placement.house ? `House ${placement.house}` : 'the Ascendant';
    const nak = placement.nak ? `within the lunar mansion of ${placement.nak}` : '';
    const ruler = placement.ruler ? `governed by the subtle rhythm of ${placement.ruler}` : '';
    const lord = placement.houseLord ? `disposed by ${placement.houseLord}` : '';

    return {
      sovereignAvatarPhrase: `The Awakened Flame of ${sign}`,
      deeperExplanation: `In ${userName}'s natal sky, ${cardTitle} (${cardKey}) is anchored in ${sign} in ${house} ${nak} ${ruler} ${lord}. Grounded through the lens of ${demographic.lifeStage}, this placement guides your capacity to manifest ${cardTheme.toLowerCase()} with sovereign clarity. In classical Vedic analysis, this point invites conscious integration of your personal impulse with cosmic order: ${demographic.lensDescription}`,
      reflectionPrompt: `How can you honor both your natural impulse in ${sign} and the higher sovereign duty calling you forward in this stage of life?`,
      dharmaConnection: `This card directly fuels your Purushartha alignment by transmuting personal experience into enduring, honorable contribution.`,
      practicalAction: `Acknowledge one genuine sovereign action in this domain today with quiet inner conviction.`,
      isAiGenerated: false,
      demographicLens: demographic.lifeStage,
    };
  }
}
