import { IBirthInput } from '../../types';

export interface HoroscopeCalculationResult {
  providerName: string;
  calculationVersion: string;
  rawHoroscope: Record<string, any>;
  calculatedAt: Date;
}

export interface IAstronomyProvider {
  readonly name: string;
  calculateHoroscope(birthDetails: IBirthInput): Promise<HoroscopeCalculationResult>;
}
