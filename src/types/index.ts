export type CardSuit = 'Dharma' | 'Artha' | 'Kama' | 'Moksha' | 'MasterKey';

export interface IAstronomicalPlacement {
  sign: number | null; // 0-11
  signName?: string;
  deg: number | null; // 0-30
  house: number | null; // 1-12
  nak: string | null;
  pada: number | null;
  lord: string | null;
  nadi: string | null;
  ruler: string | null;
  kar: {
    code: string;
    name: string;
  } | null;
  state: string | null;
  isSovereign?: boolean;
  navamshaSign?: number | null; // 0-11
  navamshaSignName?: string | null;
  houseLord?: string | null;
}

export interface ICardSeedData {
  suit: CardSuit;
  suitSymbol: string;
  suitName: string;
  suitTheme: string;
  rank: string;
  label: string;
  key: string;
  title: string;
  line: string;
  shortSummary: string;
  detailedInterpretation: string;
  reflectionQuestion: string;
  position: number;
  isFreeByDefault: boolean;
  category: 'Major' | 'Special' | 'Sphuta' | 'Varnada' | 'Upagraha' | 'MasterKey' | 'Lagna';
}

export interface IResolvedLocation {
  label: string;
  lat: number;
  lon: number;
  timezone: number; // e.g. 5.5
  ianaTimezone?: string;
}

export interface IBirthInput {
  name: string;
  gender?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm or HH:mm:ss
  place: string;
  latitude: number;
  longitude: number;
  timezone: number;
  ianaTimezone?: string;
}

export type UserRole = 'user' | 'admin' | 'superadmin' | 'analytics_manager' | 'content_manager' | 'support_admin';

export interface IAuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface IEntitlementStatus {
  isDeckPassActive: boolean;
  deckPassExpiresAt: Date | null;
  unlockedCardKeys: string[];
  freeCardKeys: string[];
}
