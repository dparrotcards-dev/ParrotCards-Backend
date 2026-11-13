import axios from 'axios';
import { IAstronomyProvider, HoroscopeCalculationResult } from './IAstronomyProvider';
import { IBirthInput } from '../../types';
import { ENV } from '../../config/env';

/**
 * PyJHoraProvider: Primary Vedic Astrological Engine
 * Connects directly to local or cloud-hosted PyJHora FastAPI Microservice.
 * Calculation method: Drik Siddhant (observational ephemeris).
 * Ayanamsa: Pushya Paksha Ayanamsa (swe.SIDM_TRUE_PUSHYA).
 */
export class PyJHoraProvider implements IAstronomyProvider {
  public readonly name = 'pyjhora';
  private apiUrl: string;

  constructor(apiUrl?: string) {
    const isProdOrVercel = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');
    const cloudFallback = 'https://parrot-cards-python-backend.vercel.app';
    const envUrl = ENV.PYJHORA_API_URL || ENV.JAGANNATHA_HORA_API_URL;

    // In production / Vercel cloud, auto-route to our live PyJHora engine if localhost is given
    if (isProdOrVercel && (!envUrl || envUrl.includes('127.0.0.1') || envUrl.includes('localhost'))) {
      this.apiUrl = apiUrl || cloudFallback;
    } else {
      this.apiUrl = apiUrl || envUrl || 'http://127.0.0.1:8000';
    }
  }

  public async calculateHoroscope(birthDetails: IBirthInput): Promise<HoroscopeCalculationResult> {
    try {
      const timeFormatted =
        birthDetails.time.includes(':') && birthDetails.time.split(':').length === 2
          ? `${birthDetails.time}:00`
          : birthDetails.time;

      const payload = {
        date: birthDetails.date,
        time: timeFormatted,
        place: birthDetails.place,
        latitude: birthDetails.latitude,
        longitude: birthDetails.longitude,
        timezone: birthDetails.timezone,
        bhava_madhya_method: 5,
      };

      const response = await axios.post(`${this.apiUrl}/horoscope`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ParrotCards/1.0.0 (PyJHora Vedic Engine)',
        },
        timeout: 25000,
      });

      if (!response.data || (!response.data.horoscope && !response.data.birth_details)) {
        throw new Error('Invalid response structure received from PyJHora Astro Engine');
      }

      return {
        providerName: this.name,
        calculationVersion: response.data.engine_revision || response.data.engine || 'pyjhora-drik-pushyapaksha-v1',
        rawHoroscope: response.data.horoscope || response.data,
        calculatedAt: new Date(),
      };
    } catch (error: any) {
      console.error('❌ PyJHoraProvider error:', error.message);
      throw new Error(`PyJHora calculation failed: ${error.message}`);
    }
  }
}

