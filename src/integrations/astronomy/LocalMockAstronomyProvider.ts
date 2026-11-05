import { IAstronomyProvider, HoroscopeCalculationResult } from './IAstronomyProvider';
import { IBirthInput } from '../../types';
import { SIGNS, NAKSHATRAS } from '../../utils/astroMath';

/**
 * Isolated deterministic calculation adapter for local development and unit tests.
 * Computes predictable Vedic astrological positions mathematically.
 */
export class LocalMockAstronomyProvider implements IAstronomyProvider {
  public readonly name = 'local_verified_mock';

  public async calculateHoroscope(birthDetails: IBirthInput): Promise<HoroscopeCalculationResult> {
    const [year, month, day] = birthDetails.date.split('-').map(Number);
    const [hours, minutes] = birthDetails.time.split(':').map(Number);

    // Deterministic base seed derived from inputs
    const daySeed = (year * 365 + month * 30 + day + hours * 60 + minutes + Math.abs(birthDetails.latitude * 10)) % 360;

    const lagnaDeg = (daySeed + (hours * 15 + minutes * 0.25)) % 360;
    const sunDeg = (daySeed * 0.985 + 280) % 360;
    const moonDeg = (daySeed * 13.176 + 45) % 360;
    const marsDeg = (daySeed * 0.524 + 110) % 360;
    const mercuryDeg = (sunDeg + 14) % 360;
    const jupiterDeg = (daySeed * 0.083 + 200) % 360;
    const venusDeg = (sunDeg + 32) % 360;
    const saturnDeg = (daySeed * 0.033 + 315) % 360;
    const rahuDeg = (360 - ((daySeed * 0.052) % 360)) % 360;
    const ketuDeg = (rahuDeg + 180) % 360;

    const lagSign = Math.floor(lagnaDeg / 30);

    const formatPoint = (name: string, absDeg: number) => {
      const signIndex = Math.floor(absDeg / 30);
      const degreeInSign = absDeg % 30;
      const nakIndex = Math.floor(absDeg / (40 / 3)) % 27;
      const pada = Math.floor((absDeg % (40 / 3)) / (10 / 3)) + 1;
      return {
        name,
        sign: signIndex + 1,
        sign_name: SIGNS[signIndex].split(' · ')[0],
        degree: degreeInSign,
        longitude: absDeg,
        nakshatra: NAKSHATRAS[nakIndex],
        pada,
        house: ((signIndex - lagSign + 12) % 12) + 1,
      };
    };

    const nakshatraPada = [
      formatPoint('Lagna', lagnaDeg),
      formatPoint('Sun', sunDeg),
      formatPoint('Moon', moonDeg),
      formatPoint('Mars', marsDeg),
      formatPoint('Mercury', mercuryDeg),
      formatPoint('Jupiter', jupiterDeg),
      formatPoint('Venus', venusDeg),
      formatPoint('Saturn', saturnDeg),
      formatPoint('Rahu', rahuDeg),
      formatPoint('Ketu', ketuDeg),
      formatPoint('Ghati Lagna', (lagnaDeg + 65) % 360),
      formatPoint('Hora Lagna', (lagnaDeg + 125) % 360),
      formatPoint('Sree Lagna', (moonDeg + 45) % 360),
      formatPoint('Indu Lagna', (moonDeg + 90) % 360),
      formatPoint('Bhava Lagna', (lagnaDeg + 30) % 360),
      formatPoint('Pranapada Lagna', (lagnaDeg + 180) % 360),
      formatPoint('Kunda Lagna', (lagnaDeg + 210) % 360),
      formatPoint('Paka Lagna', (lagnaDeg + 150) % 360),
      formatPoint('Vighati Lagna', (lagnaDeg + 270) % 360),
      formatPoint('Bhrigu Bindhu Lagna', ((rahuDeg + moonDeg) / 2) % 360),
    ];

    // Sphutas
    const sphutas = [
      formatPoint('Prana Sphuta', (lagnaDeg + sunDeg * 0.5) % 360),
      formatPoint('Yoga Sphuta', (sunDeg + moonDeg) % 360),
      formatPoint('Beeja Sphuta', (sunDeg + venusDeg + jupiterDeg) % 360),
      formatPoint('Kshetra Sphuta', (moonDeg + marsDeg + jupiterDeg) % 360),
      formatPoint('Deha Sphuta', (lagnaDeg * 2 + moonDeg) % 360),
      formatPoint('Brahma Sphuta', (lagnaDeg + jupiterDeg) % 360),
      formatPoint('Sookshma Tri Sphuta', (lagnaDeg + sunDeg + moonDeg) % 360),
      formatPoint('Rahu Tithi Sphuta', (rahuDeg + Math.abs(moonDeg - sunDeg)) % 360),
      formatPoint('Tithi Sphuta', Math.abs(moonDeg - sunDeg) % 360),
      formatPoint('Yogi Sphuta', (sunDeg + moonDeg + 93.33) % 360),
      formatPoint('Tri Sphuta', (lagnaDeg + sunDeg + moonDeg) % 360),
      formatPoint('Pancha Sphuta', (lagnaDeg + sunDeg + moonDeg + marsDeg + saturnDeg) % 360),
      formatPoint('Chatur Sphuta', (lagnaDeg + sunDeg + moonDeg + jupiterDeg) % 360),
      formatPoint('Avayogi Sphuta', (sunDeg + moonDeg + 186.66) % 360),
      formatPoint('Mrityu Sphuta', (lagnaDeg + 240) % 360),
    ];

    // Varnadas (V1 through V12)
    const varnadas: any[] = [];
    for (let i = 1; i <= 12; i++) {
      varnadas.push(formatPoint(`V${i}`, (lagnaDeg + (i - 1) * 30 + 15) % 360));
    }

    // Upagrahas
    const upagrahas = [
      formatPoint('Gulika', (saturnDeg + 45) % 360),
      formatPoint('Maandi', (saturnDeg + 35) % 360),
      formatPoint('Dhuma', (sunDeg + 133.33) % 360),
      formatPoint('Vyatipata', (360 - ((sunDeg + 133.33) % 360)) % 360),
      formatPoint('Parivesha', (360 - ((sunDeg + 133.33) % 360) + 180) % 360),
      formatPoint('Indra Chapa', (sunDeg + 313.33) % 360),
      formatPoint('Upaketu', (sunDeg + 330) % 360),
      formatPoint('Kaala', (sunDeg + 75) % 360),
      formatPoint('Mrityu', (marsDeg + 135) % 360),
      formatPoint('Ardhaprahara', (mercuryDeg + 90) % 360),
      formatPoint('Yamaghantaka', (jupiterDeg + 120) % 360),
    ];

    // Chara Karakas sorted by degree in sign (highest is Atma Karaka)
    const planetsWithDeg = [
      { name: 'Sun', deg: sunDeg % 30 },
      { name: 'Moon', deg: moonDeg % 30 },
      { name: 'Mars', deg: marsDeg % 30 },
      { name: 'Mercury', deg: mercuryDeg % 30 },
      { name: 'Jupiter', deg: jupiterDeg % 30 },
      { name: 'Venus', deg: venusDeg % 30 },
      { name: 'Saturn', deg: saturnDeg % 30 },
      { name: 'Rahu', deg: rahuDeg % 30 },
    ].sort((a, b) => b.deg - a.deg);

    const karakaCodes = ['AK', 'AmK', 'BK', 'MK', 'PK', 'GK', 'DK'];
    const charaKarakas: Record<string, any> = {};
    karakaCodes.forEach((code, index) => {
      charaKarakas[code] = { planet: planetsWithDeg[index].name };
    });

    const d9Points = [...nakshatraPada, ...sphutas, ...varnadas, ...upagrahas].map((p) => {
      const d9Sign = Math.floor((p.longitude || 0) * 0.3) % 12;
      return {
        name: p.name,
        sign: d9Sign + 1,
        sign_name: SIGNS[d9Sign].split(' · ')[0],
        longitude: ((p.longitude || 0) * 9) % 360,
      };
    });

    return {
      providerName: this.name,
      calculationVersion: '1.0.0-mock-verified',
      rawHoroscope: {
        nakshatra_pada: nakshatraPada,
        sphuta: sphutas,
        house_varnadas: varnadas,
        upagrahas: upagrahas,
        special_lagnas: nakshatraPada.filter(p => p.name.includes('Lagna')),
        bhava_chart: nakshatraPada,
        amsa_rulers: nakshatraPada,
        chara_karakas: charaKarakas,
        divisional_charts: {
          'D-9_navamsa': d9Points,
        },
        planetary_states: {
          exalted: ['Sun'],
          own_sign: ['Jupiter'],
          friendly: ['Moon', 'Mars'],
        },
      },
      calculatedAt: new Date(),
    };
  }
}
