import axios from 'axios';
import { IAstronomyProvider, HoroscopeCalculationResult } from './IAstronomyProvider';
import { IBirthInput } from '../../types';
import { ENV } from '../../config/env';

export class JagannathaHoraProvider implements IAstronomyProvider {
  public readonly name = 'jagannatha_hora';
  private apiUrl: string;

  constructor(apiUrl?: string) {
    this.apiUrl = apiUrl || ENV.JAGANNATHA_HORA_API_URL;
  }

  public async calculateHoroscope(birthDetails: IBirthInput): Promise<HoroscopeCalculationResult> {
    try {
      const timeFormatted = birthDetails.time.includes(':') && birthDetails.time.split(':').length === 2
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
          'User-Agent': 'ParrotCards/1.0.0 (Cosmic Sky Engine)',
        },
        timeout: 25000,
      });

      if (!response.data || (!response.data.horoscope && !response.data.birth_details)) {
        throw new Error('Invalid response structure received from Jagannatha Hora API');
      }

      return {
        providerName: this.name,
        calculationVersion: response.data.engine_revision || '1.0.0',
        rawHoroscope: response.data.horoscope || response.data,
        calculatedAt: new Date(),
      };
    } catch (error: any) {
      console.error('❌ JagannathaHoraProvider error:', error.message);
      throw new Error(`Jagannatha Hora calculation failed: ${error.message}`);
    }
  }
}
