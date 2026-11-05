export const SIGNS = [
  'Aries · Mesha',
  'Taurus · Vrishabha',
  'Gemini · Mithuna',
  'Cancer · Karka',
  'Leo · Simha',
  'Virgo · Kanya',
  'Libra · Tula',
  'Scorpio · Vrischika',
  'Sagittarius · Dhanus',
  'Capricorn · Makara',
  'Aquarius · Kumbha',
  'Pisces · Meena'
];

export const SIGN_NAMES = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

export const SIGN_RX = [
  /^(ari|mes)/,
  /^(tau|vrishab|vrisab|vrish$)/,
  /^(gem|mit)/,
  /^(can|kar)/,
  /^(leo|sim)/,
  /^(vir|kan)/,
  /^(lib|tul)/,
  /^(sco|vris?h?c|vrk)/,
  /^(sag|dha)/,
  /^(cap|mak)/,
  /^(aqu|kum)/,
  /^(pis|mee|min)/
];

export const KARAKAS = [
  ['atma', 'AK', 'Atma Karaka'],
  ['amatya', 'AmK', 'Amatya Karaka'],
  ['bhratri', 'BK', 'Bhratri Karaka'],
  ['matri', 'MK', 'Matri Karaka'],
  ['putra', 'PK', 'Putra Karaka'],
  ['pitri', 'PiK', 'Pitri Karaka'],
  ['gnati', 'GK', 'Gnati Karaka'],
  ['jnati', 'GK', 'Gnati Karaka'],
  ['dara', 'DK', 'Dara Karaka']
];

export const HOUSE_NAMES = [
  '',
  'Self, body, temperament',
  'Wealth, speech, family',
  'Courage, siblings',
  'Home, mother, peace',
  'Intellect, children',
  'Health, rivals, service',
  'Partnership, spouse',
  'Longevity, the hidden',
  'Fortune, dharma',
  'Career, action',
  'Gains, friends',
  'Loss, liberation'
];

export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
];

export const NAKSHATRA_LORDS = [
  'Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'
];

export const PRIMARY_PLANETS = [
  'sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn', 'rahu', 'ketu'
];

export const canon = (s: any): string =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1+/g, '$1')
    .replace(/h/g, '');

const AL0: Record<string, string[]> = {
  Lagna: ['lagna', 'ascendant', 'asc'],
  Sun: ['sun', 'surya'],
  Moon: ['moon', 'chandra'],
  Mars: ['mars', 'mangala', 'kuja'],
  Mercury: ['mercury', 'budha'],
  Jupiter: ['jupiter', 'guru'],
  Venus: ['venus', 'sukra', 'shukra'],
  Saturn: ['saturn', 'sani', 'shani'],
  Dhuma: ['dhuma', 'dhooma', 'dhoom'],
  Vyatipata: ['vyatipata', 'vyatipaata'],
  Parivesha: ['parivesha', 'paridhi'],
  'Indra Chapa': ['indra chapa', 'indrachaapa', 'indrachapa'],
  Mrityu: ['mrityu', 'mrtyu'],
  'Artha Prahara': ['artha prahara', 'artha praharaka', 'ardhaprahara', 'ardha prahara'],
  Ardhaprahara: ['ardhaprahara', 'artha prahara', 'ardha prahara', 'artha praharaka'],
  Kaala: ['kaala', 'kala'],
  Maandi: ['maandi', 'mandi'],
  'Sree Lagna': ['sree lagna', 'sri lagna'],
  'Ghati Lagna': ['ghati lagna', 'ghatika lagna'],
  'Vighati Lagna': ['vighati lagna', 'vighatika lagna'],
  'Bhrigu Bindhu Lagna': ['bhrigu bindhu lagna', 'bhrigu bindu lagna', 'bhrigu bindu', 'bhrigu bindhu'],
  'Pranapada Lagna': ['pranapada lagna', 'pranapada'],
  'Paka Lagna': ['paka lagna', 'paka'],
  'Sookshma Tri Sphuta': ['sookshma tri sphuta', 'sukshma tri sphuta'],
  'Arudha Lagna': ['arudha lagna', 'arudha', 'al', 'arudha pada'],
  'Beeja Sphuta': ['beeja sphuta', 'bija sphuta', 'beeja', 'bija'],
  'Kshetra Sphuta': ['kshetra sphuta', 'ksetra sphuta', 'kshetra'],
  'Rahu Tithi Sphuta': ['rahu tithi sphuta', 'patasphuta', 'pata sphuta'],
  Patasphuta: ['patasphuta', 'rahu tithi sphuta', 'pata sphuta'],
  'Kunda Lagna': ['kunda lagna', 'kunda sphuta', 'kunda'],
  'Avayogi Sphuta': ['avayogi sphuta', 'avayoga sphuta', 'avayogi'],
  'Chatur Sphuta': ['chatur sphuta', 'chatusphuta', 'chatus sphuta'],
  'Pancha Sphuta': ['pancha sphuta', 'panchasphuta'],
  'Tri Sphuta': ['tri sphuta', 'trisphuta'],
  V1: ['v1', 'varnada lagna', 'varnada']
};

export const ALIAS: Record<string, string[]> = {};
for (const k in AL0) {
  ALIAS[canon(k)] = AL0[k].map(canon);
}

export function signFrom(v: any): number | null {
  if (typeof v === 'number' && v >= 1 && v <= 12) return v - 1;
  if (typeof v === 'string') {
    const s = v.toLowerCase().replace(/[^a-z]/g, '');
    for (let i = 0; i < 12; i++) {
      if (SIGN_RX[i].test(s)) return i;
    }
  }
  return null;
}

export function parseDeg(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const n = v.match(/\d+(\.\d+)?/g);
  if (!n) return NaN;
  return parseFloat(n[0]) + (n[1] ? parseFloat(n[1]) / 60 : 0) + (n[2] ? parseFloat(n[2]) / 3600 : 0);
}

export function fmtDeg(d: number | null): string {
  if (d == null || isNaN(d)) return '—';
  const deg = Math.floor(d);
  const min = Math.floor((d % 1) * 60);
  return `${deg}° ${String(min).padStart(2, '0')}′`;
}

export function nakFromLon(l: number): { nak: string; pada: number; lord: string } {
  const u = 40 / 3;
  const i = Math.floor(l / u) % 27;
  return {
    nak: NAKSHATRAS[i],
    pada: Math.floor((l % u) / (u / 4)) + 1,
    lord: NAKSHATRA_LORDS[i % 9]
  };
}

export function nadiNo(d: number | null): number | null {
  return d == null ? null : Math.min(150, Math.floor(d / 0.2) + 1);
}

export const SIGN_LORDS: readonly string[] = [
  'Mars',     // 0 Aries
  'Venus',    // 1 Taurus
  'Mercury',  // 2 Gemini
  'Moon',     // 3 Cancer
  'Sun',      // 4 Leo
  'Mercury',  // 5 Virgo
  'Venus',    // 6 Libra
  'Mars',     // 7 Scorpio
  'Jupiter',  // 8 Sagittarius
  'Saturn',   // 9 Capricorn
  'Saturn',   // 10 Aquarius
  'Jupiter',  // 11 Pisces
];

/**
 * Computes classical Parashara Navamsha (D9) sign (0-11) and sign name.
 * Each sign has 9 navamshas of 3°20' (3.3333333333°, i.e. 10/3°).
 * Zodiac longitude L = sign * 30 + deg.
 * Total navamsha index in zodiac = floor(L / (10/3)) = floor(L * 0.3).
 * Navamsha sign = floor(L * 0.3) % 12.
 */
export function computeNavamsha(
  sign: number | null,
  deg: number | null
): { navamshaSign: number | null; navamshaSignName: string | null } {
  if (sign == null || sign < 0 || sign > 11) {
    return { navamshaSign: null, navamshaSignName: null };
  }
  const d = deg != null && !isNaN(deg) ? Math.max(0, Math.min(29.999999, deg)) : 0;
  const totalDeg = sign * 30 + d;
  const navamshaSign = Math.floor(totalDeg * 0.3) % 12;
  return {
    navamshaSign,
    navamshaSignName: SIGN_NAMES[navamshaSign],
  };
}

/**
 * Returns the classical planetary house lord (dispositor) of the occupied sign.
 */
export function getHouseLord(sign: number | null): string | null {
  if (sign == null || sign < 0 || sign > 11) {
    return null;
  }
  return SIGN_LORDS[sign];
}

