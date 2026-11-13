import mongoose from 'mongoose';
import { IAstronomyProvider, HoroscopeCalculationResult } from './IAstronomyProvider';
import { PyJHoraProvider } from './PyJHoraProvider';
import { LocalMockAstronomyProvider } from './LocalMockAstronomyProvider';
import { AstronomicalCalculation, IAstronomicalCalculation } from '../../models/AstronomicalCalculation';
import { IBirthInput, IAstronomicalPlacement } from '../../types';
import { APPROVED_55_CARDS } from '../../utils/seedCards';
import {
  SIGNS,
  SIGN_NAMES,
  SIGN_RX,
  SIGN_LORDS,
  KARAKAS,
  HOUSE_NAMES,
  NAKSHATRAS,
  NAKSHATRA_LORDS,
  PRIMARY_PLANETS,
  canon,
  ALIAS,
  signFrom,
  parseDeg,
  fmtDeg,
  nakFromLon,
  nadiNo,
  computeNavamsha,
  getHouseLord,
} from '../../utils/astroMath';
import { ENV } from '../../config/env';

export class AstronomyService {
  private primaryProvider: IAstronomyProvider;
  private fallbackProvider: IAstronomyProvider;

  constructor(providerName?: string) {
    const selected = providerName || ENV.ASTRONOMY_PROVIDER;
    if (selected === 'mock' || selected === 'local') {
      this.primaryProvider = new LocalMockAstronomyProvider();
    } else {
      this.primaryProvider = new PyJHoraProvider();
    }
    this.fallbackProvider = new LocalMockAstronomyProvider();
  }

  /**
   * Convert local date & time & timezone into exact UTC Date object
   */
  public computeUtcDate(dateStr: string, timeStr: string, timezoneHours: number): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);

    // Initial UTC timestamp assuming the local numbers were UTC
    const localEpoch = Date.UTC(year, month - 1, day, hours, minutes, seconds);
    // Subtract timezone offset in milliseconds to get real UTC
    const tzOffsetMs = timezoneHours * 60 * 60 * 1000;
    return new Date(localEpoch - tzOffsetMs);
  }

  /**
   * Ensure any placement records have navamshaSign, navamshaSignName, and houseLord populated.
   * Guarantees 100% backward compatibility for existing cached documents without API calls.
   */
  public enrichParsedPoints(points: Record<string, IAstronomicalPlacement>): void {
    if (!points || typeof points !== 'object') return;
    for (const [key, placement] of Object.entries(points)) {
      if (!placement) continue;
      if (placement.sign != null) {
        if (placement.navamshaSign == null) {
          const nav = computeNavamsha(placement.sign, placement.deg ?? 0);
          placement.navamshaSign = nav.navamshaSign;
          placement.navamshaSignName = nav.navamshaSignName;
        }
        if (!placement.houseLord) {
          placement.houseLord = getHouseLord(placement.sign);
        }
        if (!placement.signName && placement.sign >= 0 && placement.sign < 12) {
          placement.signName = SIGN_NAMES[placement.sign];
        }
      }
    }
  }

  /**
   * Calculate or reuse saved astronomical calculation for a given profile
   */
  public async getOrCalculate(
    profileId: mongoose.Types.ObjectId,
    birthInput: IBirthInput
  ): Promise<IAstronomicalCalculation> {
    const utcDateTime = this.computeUtcDate(birthInput.date, birthInput.time, birthInput.timezone);

    // Check if valid calculation already exists for this profile with same inputs
    const existing = await AstronomicalCalculation.findOne({
      profileId,
      'inputSnapshot.date': birthInput.date,
      'inputSnapshot.time': birthInput.time,
      'inputSnapshot.latitude': birthInput.latitude,
      'inputSnapshot.longitude': birthInput.longitude,
    }).sort({ calculatedAt: -1 });

    if (existing && existing.foundPointsCount > 10) {
      // Backward compatibility: enrich cached document in memory without redundant API call
      this.enrichParsedPoints(existing.parsedPoints);
      return existing;
    }

    // Perform calculation
    let rawResult: HoroscopeCalculationResult;
    try {
      rawResult = await this.primaryProvider.calculateHoroscope(birthInput);
    } catch (err: any) {
      console.warn(`⚠️ Primary astronomical provider (${this.primaryProvider.name}) failed: ${err.message}. Engaging fallback provider.`);
      rawResult = await this.fallbackProvider.calculateHoroscope(birthInput);
    }

    // Parse the horoscope into structured card placements
    const parsed = this.parseHoroscopeData(rawResult.rawHoroscope);

    const calculation = await AstronomicalCalculation.create({
      profileId,
      provider: rawResult.providerName,
      calculationVersion: rawResult.calculationVersion,
      inputSnapshot: {
        date: birthInput.date,
        time: birthInput.time,
        place: birthInput.place,
        latitude: birthInput.latitude,
        longitude: birthInput.longitude,
        timezone: birthInput.timezone,
        utcDateTime,
      },
      // Safety Requirement 3: Stop persisting full ~3.5 MB rawHoroscope for new calculations.
      // Store only lean engine metadata required by Parrot Cards specifications.
      rawHoroscope: {
        ayanamsa: rawResult.rawHoroscope?.ayanamsa || rawResult.rawHoroscope?.ayanamsa_name || 'Lahiri',
        engine_revision: rawResult.calculationVersion || '1.0.0',
        calculated_at: rawResult.calculatedAt,
        cached: true,
      },
      parsedPoints: parsed.points,
      lagSign: parsed.lagSign,
      akPlanet: parsed.akPlanet,
      foundPointsCount: parsed.foundCount,
      totalPointsCount: APPROVED_55_CARDS.length,
      calculatedAt: rawResult.calculatedAt,
    });

    return calculation;
  }

  /**
   * Traverse horoscope objects, extract positions, signs, houses, nakshatras, chara karakas
   */
  public parseHoroscopeData(horoscope: Record<string, any>): {
    points: Record<string, IAstronomicalPlacement>;
    lagSign: number | null;
    akPlanet: string | null;
    foundCount: number;
  } {
    const collectNodes = (obj: any): Array<{ name: string; data: any }> => {
      const out: Array<{ name: string; data: any }> = [];
      const walk = (o: any, key: string | null) => {
        if (Array.isArray(o)) {
          o.forEach((item) => walk(item, key));
          return;
        }
        if (o && typeof o === 'object') {
          let name: string | null = null;
          for (const k of ['name', 'planet', 'body', 'point', 'label', 'entity', 'graha', 'sphuta', 'lagna', 'upagraha', 'varnada']) {
            if (typeof o[k] === 'string') {
              name = o[k];
              break;
            }
          }
          const hasPos = Object.entries(o).some(
            ([k, v]) => /sign|rasi|raasi|rashi|longitude|^lon$|^long$|degree|^deg/i.test(k) && v !== null && typeof v !== 'object'
          );
          if (hasPos) {
            if (name) out.push({ name, data: o });
            else if (key) out.push({ name: key, data: o });
          }
          for (const [k, v] of Object.entries(o)) {
            walk(v, k);
          }
        } else if (typeof o === 'string' && key && !/sign|rasi|degree/i.test(key) && o.length < 60 && signFrom(o) !== null && /\d/.test(o)) {
          out.push({ name: key, data: { position: o } });
        }
      };
      walk(obj, null);
      return out;
    };

    const flat = (o: any, p = '', out: Array<[string, any]> = [], d = 0): Array<[string, any]> => {
      if (d > 5) return out;
      if (Array.isArray(o)) {
        o.forEach((x, i) => flat(x, `${p}[${i}]`, out, d + 1));
      } else if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          flat(v, p ? `${p}.${k}` : k, out, d + 1);
        }
      } else if (o != null) {
        out.push([p, o]);
      }
      return out;
    };

    const last = (p: string) => p.split('.').pop()!.replace(/\[\d+\]$/g, '').toLowerCase();

    const readPos = (d: any): { sign: number | null; deg: number | null; house: number | null } => {
      let sign: number | null = null;
      let deg: number | null = null;
      let lon: number | null = null;
      let house: number | null = null;

      for (const [p, v] of flat(d)) {
        const lp = p.toLowerCase();
        const k = last(p);
        if (/nakshatra|pada|amsa|nadi|ruler|speed|lat|dasha|bala|retro/.test(lp)) continue;

        if (/^(sign|rasi|raasi|rashi)(_?name)?$/.test(k)) {
          const s = signFrom(v);
          if (s != null && sign == null) sign = s;
          if (typeof v === 'string' && /\d/.test(v) && deg == null) deg = parseDeg(v);
        } else if (/^(sign|rasi|raasi|rashi)_?(number|num|no|index|id)$/.test(k)) {
          const n = +v;
          if (n >= 1 && n <= 12 && sign == null) sign = n - 1;
        } else if (/^(longitude|lon|long|abs_?longitude|absolute_?longitude|sidereal_?longitude)$/.test(k)) {
          const x = parseDeg(v);
          if (!isNaN(x) && lon == null) lon = x;
        } else if (/^(degree|degrees|deg|degree_?in_?sign|degrees_?in_?sign|sign_?degree)$/.test(k)) {
          const x = parseDeg(v);
          if (!isNaN(x) && deg == null) deg = x;
        } else if (k === 'position' && typeof v === 'string') {
          const s = signFrom(v);
          if (s != null && sign == null) sign = s;
          const x = parseDeg(v);
          if (!isNaN(x) && deg == null) deg = x;
        } else if (/^(house|bhava)(_?(number|num|no))?$/.test(k) && Number.isInteger(+v) && +v >= 1 && +v <= 12 && house == null) {
          house = +v;
        }
      }

      if (lon != null) {
        if (sign == null && lon >= 0 && lon < 360) sign = Math.floor(lon / 30);
        if (deg == null || lon >= 30) deg = lon >= 30 ? lon % 30 : lon;
      }

      return {
        sign,
        house,
        deg: deg != null && !isNaN(deg) && deg >= 0 && deg < 30 ? deg : null,
      };
    };

    const findNode = (nodes: Array<{ name: string; data: any }>, name: string, exact = false) => {
      const vm = /^v(\d+)$/i.exec(name);
      if (vm) {
        const n = +vm[1];
        let h = nodes.find((x) => {
          const m = /^v\s*[-_ ]?0?(\d+)(?!\d)/i.exec(String(x.name).trim());
          return m && +m[1] === n;
        });
        if (!h && n === 1) {
          h = nodes.find((x) => /varnada/i.test(x.name) && !/\d/.test(x.name));
        }
        return h;
      }
      const c = canon(name);
      const al = ALIAS[c] || [c];
      const ex = nodes.find((n) => al.includes(canon(n.name)));
      if (ex || exact) return ex;
      return nodes.find((n) => {
        const x = canon(n.name);
        return x.length >= 3 && c.length >= 3 && (x.startsWith(c) || (c.endsWith('lagna') && x + 'lagna' === c));
      });
    };

    const nakApi = (d: any) => {
      if (!d) return {};
      const o: { nak?: string; pada?: number; lord?: string } = {};
      for (const [p, v] of flat(d)) {
        const k = last(p);
        const lp = p.toLowerCase();
        if (/pada/.test(k) && !/lord|name/.test(k) && o.pada == null && +v >= 1 && +v <= 4) {
          o.pada = +v;
        } else if (/lord/.test(lp) && /nakshatra|lord/.test(k) && o.lord == null && typeof v === 'string') {
          o.lord = v;
        } else if (/nakshatra/.test(lp) && !/lord|pada|deg|index|id$|remain/.test(k)) {
          if (/number|num|no|index/.test(k) && +v >= 1 && +v <= 27) {
            if (o.nak == null) o.nak = NAKSHATRAS[+v - 1];
          } else if (typeof v === 'string' && isNaN(+v) && o.nak == null) {
            o.nak = v;
          }
        }
      }
      return o;
    };

    const amsaInfo = (d: any) => {
      if (!d) return { nadi: null, ruler: null };
      const o: { nadi?: any[]; ruler?: string; rulerP?: string } = {};
      for (const [p, v] of flat(d)) {
        const lp = p.toLowerCase();
        if (/nadi|150/.test(lp) && typeof v !== 'object') {
          (o.nadi = o.nadi || []).push(v);
        } else if (/ruler|deity|devata/.test(lp) && typeof v === 'string') {
          if (/60|shashti|sashti/.test(lp)) {
            o.rulerP = o.rulerP || v;
          } else {
            o.ruler = o.ruler || v;
          }
        }
      }
      return {
        nadi: o.nadi ? [...new Set(o.nadi)].slice(0, 2).join(' · ') : null,
        ruler: o.rulerP || o.ruler || null,
      };
    };

    const N = {
      nak: collectNodes(horoscope.nakshatra_pada),
      am: collectNodes(horoscope.amsa_rulers),
      upa: collectNodes(horoscope.upagrahas),
      sl: collectNodes(horoscope.special_lagnas),
      vn: collectNodes(horoscope.house_varnadas),
      sp: collectNodes(horoscope.sphuta),
      bh: collectNodes(horoscope.bhava_chart),
      d9: collectNodes(
        horoscope.divisional_charts?.['D-9_navamsa'] ||
        horoscope.divisional_charts?.['d9'] ||
        horoscope['D-9_navamsa'] ||
        horoscope.d9_chart ||
        horoscope.d9 ||
        {}
      ),
    };

    const lg = findNode([...N.nak, ...N.am, ...N.bh], 'Lagna', true);
    const lagSign = lg ? readPos(lg.data).sign : null;

    // Chara Karakas
    const kmap: Record<string, [string, string, string]> = {};
    const walkKar = (o: any, key: string) => {
      if (Array.isArray(o)) {
        o.forEach((x) => walkKar(x, key));
        return;
      }
      if (o && typeof o === 'object') {
        const own = Object.entries(o).filter(([, v]) => typeof v === 'string');
        const txt = (key + ' ' + own.map(([k, v]) => k + ' ' + v).join(' ')).toLowerCase();
        const kt = KARAKAS.find(([s]) => txt.includes(s));
        const pl = own.map(([, v]) => v).find((v) => PRIMARY_PLANETS.includes(String(v).toLowerCase()));
        if (kt && pl && !kmap[canon(pl)]) {
          kmap[canon(pl)] = kt as [string, string, string];
        }
        for (const [k, v] of Object.entries(o)) {
          walkKar(v, k);
        }
      }
    };
    walkKar(horoscope.chara_karakas, '');

    // Planetary states
    const statesOf = (name: string): string | null => {
      const out: string[] = [];
      const walkState = (o: any, key: string) => {
        if (Array.isArray(o)) {
          if (o.some((x) => typeof x === 'string' && canon(x) === canon(name))) {
            out.push(key);
          } else {
            o.forEach((x) => walkState(x, key));
          }
        } else if (o && typeof o === 'object') {
          Object.entries(o).forEach(([k, v]) => walkState(v, k));
        }
      };
      walkState(horoscope.planetary_states, '');
      return out.length ? out.map((s) => s.replace(/_/g, ' ')).join(', ') : null;
    };

    const secsOf = (k: string): Array<keyof typeof N> => {
      if (k === 'Lagna') return ['nak', 'am', 'bh'];
      if (PRIMARY_PLANETS.includes(k.toLowerCase()) || /^(Uranus|Neptune|Pluto)$/.test(k)) return ['nak', 'am'];
      if (/Sphuta$/.test(k)) return ['sp', 'am'];
      if (/^V\d+$/.test(k)) return ['vn', 'sl', 'am'];
      if (/Lagna$/.test(k)) return ['sl', 'am'];
      return ['upa', 'am'];
    };

    const points: Record<string, IAstronomicalPlacement> = {};
    let foundCount = 0;

    for (const card of APPROVED_55_CARDS) {
      const k = card.key;
      // Handle Master Keys specially
      if (card.suit === 'MasterKey') {
        const masterSign = lagSign != null ? lagSign : 0;
        const masterNav = computeNavamsha(masterSign, 0);
        points[k] = {
          sign: masterSign,
          signName: SIGN_NAMES[masterSign],
          deg: 0,
          house: 1,
          nak: 'Ashwini',
          pada: 1,
          lord: 'Ketu',
          nadi: 'Sovereign Nexus',
          ruler: 'Cosmic Intelligence',
          kar: null,
          state: 'Transcendent',
          isSovereign: true,
          navamshaSign: masterNav.navamshaSign,
          navamshaSignName: masterNav.navamshaSignName,
          houseLord: getHouseLord(masterSign),
        };
        foundCount++;
        continue;
      }

      const secs = secsOf(k);
      let hit: any = null;
      for (const sec of secs) {
        hit = findNode(N[sec], k, true);
        if (hit) break;
      }
      if (!hit) {
        for (const sec of secs) {
          hit = findNode(N[sec], k);
          if (hit) break;
        }
      }

      const am = findNode(N.am, k, true) || findNode(N.am, k);
      const p = hit ? readPos(hit.data) : { sign: null, deg: null, house: null };
      if (p.sign == null && am) {
        const q = readPos(am.data);
        p.sign = q.sign;
        p.deg = q.deg;
        p.house = p.house || q.house;
      }

      if (p.sign != null) foundCount++;

      const house = k === 'Lagna' ? 1 : p.house || (p.sign != null && lagSign != null ? ((p.sign - lagSign + 12) % 12) + 1 : null);
      const a = nakApi((findNode(N.nak, k, true) || {}).data);
      const cn = p.sign != null && p.deg != null ? nakFromLon(p.sign * 30 + p.deg) : { nak: null, pada: null, lord: null };
      const am2 = amsaInfo(am && am.data);
      const kt = kmap[canon(k)];

      // Navamsha calculation & API verification
      let navamshaSign: number | null = null;
      let navamshaSignName: string | null = null;

      // 1. Check if D9 divisional chart from provider has explicit node for this point
      const d9Hit = findNode(N.d9, k, true) || findNode(N.d9, k);
      if (d9Hit) {
        const d9Pos = readPos(d9Hit.data);
        if (d9Pos.sign != null) {
          navamshaSign = d9Pos.sign;
          navamshaSignName = SIGN_NAMES[d9Pos.sign];
        }
      }

      // 2. If not explicitly in D9 nodes, use verified Parashara classical Navamsha formula
      if (navamshaSign == null && p.sign != null) {
        const nav = computeNavamsha(p.sign, p.deg);
        navamshaSign = nav.navamshaSign;
        navamshaSignName = nav.navamshaSignName;
      }

      const houseLord = getHouseLord(p.sign);

      points[k] = {
        sign: p.sign,
        signName: p.sign != null ? SIGN_NAMES[p.sign] : undefined,
        deg: p.deg,
        house,
        nak: a.nak || cn.nak,
        pada: a.pada ?? cn.pada,
        lord: a.lord || cn.lord,
        nadi: am2.nadi || (p.deg != null ? `#${nadiNo(p.deg)} of 150` : null),
        ruler: am2.ruler,
        kar: kt ? { code: kt[1], name: kt[2] } : null,
        state: statesOf(k),
        isSovereign: false,
        navamshaSign,
        navamshaSignName,
        houseLord,
      };
    }

    // Determine Sovereign Atma Karaka (AK)
    let akPlanet: string | null = null;
    for (const [key, val] of Object.entries(points)) {
      if (val.kar && val.kar.code === 'AK') {
        akPlanet = key;
        val.isSovereign = true;
        break;
      }
    }

    // Fallback: If no AK was explicit, pick Sun or Lagna as sovereign
    if (!akPlanet) {
      akPlanet = points['Sun'] ? 'Sun' : 'Lagna';
      if (points[akPlanet]) {
        points[akPlanet].isSovereign = true;
      }
    }

    return {
      points,
      lagSign,
      akPlanet,
      foundCount,
    };
  }
}
