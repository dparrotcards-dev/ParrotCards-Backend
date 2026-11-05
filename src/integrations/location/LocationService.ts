import axios from 'axios';
import { IResolvedLocation } from '../../types';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

export class LocationService {
  private cache: Map<string, { timestamp: number; data: IResolvedLocation[] }> = new Map();
  private readonly CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

  /**
   * Search locations using OpenStreetMap Nominatim API with compliant User-Agent and caching
   */
  public async searchLocations(query: string, limit = 6): Promise<IResolvedLocation[]> {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) {
      return [];
    }

    // Check memory cache
    const cached = this.cache.get(q);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const response = await axios.get<NominatimResult[]>('https://nominatim.openstreetmap.org/search', {
        params: {
          q,
          format: 'json',
          addressdetails: 1,
          limit,
        },
        headers: {
          'User-Agent': 'ParrotCards/1.0.0 (contact: support@parrotcards.internal; educational research)',
          'Accept-Language': 'en',
        },
        timeout: 8000,
      });

      const results: IResolvedLocation[] = (response.data || []).map((item) => {
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const timezone = this.estimateTimezoneFromCoordinates(lat, lon, item.address?.country_code);

        return {
          label: item.display_name,
          lat,
          lon,
          timezone,
          ianaTimezone: this.estimateIanaTimezone(timezone, item.address?.country_code),
        };
      });

      this.cache.set(q, { timestamp: Date.now(), data: results });
      return results;
    } catch (error: any) {
      console.warn('⚠️ Nominatim search failed, providing fallback matching:', error.message);
      return this.fallbackLocations(q);
    }
  }

  /**
   * Estimate standard UTC offset in hours from coordinates and country
   */
  public estimateTimezoneFromCoordinates(lat: number, lon: number, countryCode?: string): number {
    const code = (countryCode || '').toLowerCase();

    // Specific well-defined territorial timezones
    if (code === 'in') return 5.5; // India
    if (code === 'np') return 5.75; // Nepal
    if (code === 'lk') return 5.5; // Sri Lanka
    if (code === 'pk') return 5.0; // Pakistan
    if (code === 'bd') return 6.0; // Bangladesh
    if (code === 'bt') return 6.0; // Bhutan
    if (code === 'mm') return 6.5; // Myanmar
    if (code === 'ae') return 4.0; // UAE
    if (code === 'sa' || code === 'qa' || code === 'kw' || code === 'bh') return 3.0; // Gulf
    if (code === 'om') return 4.0; // Oman
    if (code === 'ir') return 3.5; // Iran
    if (code === 'af') return 4.5; // Afghanistan
    if (code === 'sg') return 8.0; // Singapore
    if (code === 'my') return 8.0; // Malaysia
    if (code === 'th' || code === 'vn' || code === 'kh' || code === 'la') return 7.0; // Indochina
    if (code === 'jp') return 9.0; // Japan
    if (code === 'kr') return 9.0; // South Korea
    if (code === 'cn' || code === 'hk' || code === 'tw') return 8.0; // China / HK / Taiwan
    if (code === 'ph') return 8.0; // Philippines
    if (code === 'id') return lon < 110 ? 7.0 : (lon < 120 ? 8.0 : 9.0); // Indonesia
    if (code === 'gb') return 0.0; // UK
    if (code === 'de' || code === 'fr' || code === 'it' || code === 'es' || code === 'nl' || code === 'be' || code === 'ch' || code === 'at' || code === 'se' || code === 'no' || code === 'dk') {
      return 1.0; // Central Europe
    }
    if (code === 'gr' || code === 'ro' || code === 'bg' || code === 'eg' || code === 'za') return 2.0; // Eastern Europe / Egypt / South Africa
    if (code === 'ru') return lon < 45 ? 3.0 : (lon < 65 ? 5.0 : (lon < 90 ? 7.0 : 8.0)); // Russia
    if (code === 'au') return lon < 129 ? 8.0 : (lon < 140 ? 9.5 : 10.0); // Australia
    if (code === 'nz') return 12.0; // New Zealand
    if (code === 'br') return -3.0; // Brazil (main)
    if (code === 'ar') return -3.0; // Argentina

    // North America approximations by longitude
    if (code === 'us' || code === 'ca' || code === 'mx') {
      if (lon < -115) return -8.0; // Pacific
      if (lon < -100) return -7.0; // Mountain
      if (lon < -85) return -6.0; // Central
      return -5.0; // Eastern
    }

    // Longitude-based timezone: each 15 degrees is ~ 1 hour
    const rawOffset = lon / 15;
    const rounded = Math.round(rawOffset * 2) / 2; // round to nearest 0.5 hour
    return Math.max(-12, Math.min(14, rounded));
  }

  public estimateIanaTimezone(offset: number, countryCode?: string): string {
    const code = (countryCode || '').toLowerCase();
    if (code === 'in') return 'Asia/Kolkata';
    if (code === 'np') return 'Asia/Kathmandu';
    if (code === 'lk') return 'Asia/Colombo';
    if (code === 'pk') return 'Asia/Karachi';
    if (code === 'bd') return 'Asia/Dhaka';
    if (code === 'ae') return 'Asia/Dubai';
    if (code === 'sa') return 'Asia/Riyadh';
    if (code === 'sg') return 'Asia/Singapore';
    if (code === 'jp') return 'Asia/Tokyo';
    if (code === 'gb') return 'Europe/London';
    if (code === 'de') return 'Europe/Berlin';
    if (code === 'fr') return 'Europe/Paris';
    if (code === 'au') return offset === 8 ? 'Australia/Perth' : (offset === 9.5 ? 'Australia/Adelaide' : 'Australia/Sydney');
    if (code === 'us' || code === 'ca') {
      if (offset === -8) return 'America/Los_Angeles';
      if (offset === -7) return 'America/Denver';
      if (offset === -6) return 'America/Chicago';
      return 'America/New_York';
    }
    return offset >= 0 ? `Etc/GMT-${offset}` : `Etc/GMT+${Math.abs(offset)}`;
  }

  private fallbackLocations(q: string): IResolvedLocation[] {
    const popular: IResolvedLocation[] = [
      { label: 'Jaipur, Rajasthan, India', lat: 26.9124, lon: 75.7873, timezone: 5.5, ianaTimezone: 'Asia/Kolkata' },
      { label: 'New Delhi, Delhi, India', lat: 28.6139, lon: 77.2090, timezone: 5.5, ianaTimezone: 'Asia/Kolkata' },
      { label: 'Mumbai, Maharashtra, India', lat: 19.0760, lon: 72.8777, timezone: 5.5, ianaTimezone: 'Asia/Kolkata' },
      { label: 'Bengaluru, Karnataka, India', lat: 12.9716, lon: 77.5946, timezone: 5.5, ianaTimezone: 'Asia/Kolkata' },
      { label: 'Varanasi, Uttar Pradesh, India', lat: 25.3176, lon: 82.9739, timezone: 5.5, ianaTimezone: 'Asia/Kolkata' },
      { label: 'London, Greater London, England, United Kingdom', lat: 51.5074, lon: -0.1278, timezone: 0.0, ianaTimezone: 'Europe/London' },
      { label: 'New York, United States', lat: 40.7128, lon: -74.0060, timezone: -5.0, ianaTimezone: 'America/New_York' },
      { label: 'San Francisco, California, United States', lat: 37.7749, lon: -122.4194, timezone: -8.0, ianaTimezone: 'America/Los_Angeles' },
      { label: 'Dubai, United Arab Emirates', lat: 25.2048, lon: 55.2708, timezone: 4.0, ianaTimezone: 'Asia/Dubai' },
      { label: 'Singapore', lat: 1.3521, lon: 103.8198, timezone: 8.0, ianaTimezone: 'Asia/Singapore' },
    ];
    return popular.filter((p) => p.label.toLowerCase().includes(q));
  }
}
