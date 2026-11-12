import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { SiteSettings, DEFAULT_SITE_SETTINGS } from '../models/SiteSettings';
import { AuditLog } from '../models/AuditLog';

const readSettings = async () => {
  const saved = await SiteSettings.findOne({ key: 'public' }).lean();
  return {
    ...DEFAULT_SITE_SETTINGS,
    ...saved,
    brand: { ...DEFAULT_SITE_SETTINGS.brand, ...saved?.brand },
    pricing: { ...DEFAULT_SITE_SETTINGS.pricing, ...saved?.pricing },
    legal: { ...DEFAULT_SITE_SETTINGS.legal, ...saved?.legal },
  };
};

const parseText = (value: unknown, fallback: string, field: string, maxLength: number): string => {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const text = value.trim();
  if (!text || text.length > maxLength) throw new Error(`${field} must be between 1 and ${maxLength} characters`);
  return text;
};

const parsePricePaise = (value: unknown, field: string): number => {
  const rupees = Number(value);
  if (!Number.isFinite(rupees) || rupees < 1 || rupees > 100000 || Math.round(rupees * 100) !== rupees * 100) {
    throw new Error(`${field} must be a valid amount between ₹1 and ₹100,000 with up to 2 decimal places`);
  }
  return Math.round(rupees * 100);
};

const parseDuration = (value: unknown): number => {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new Error('Deck pass duration must be between 1 and 3650 days');
  }
  return days;
};

export class SiteSettingsController {
  public async getPublic(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await readSettings() });
    } catch (error) {
      next(error);
    }
  }

  public async getAdmin(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await readSettings() });
    } catch (error) {
      next(error);
    }
  }

  public async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { brand, pricing, legal } = req.body ?? {};
      if (!brand || !pricing || !legal) throw new Error('Brand, pricing, and legal settings are required');

      const settings = {
        brand: {
          name: parseText(brand.name, '', 'Site name', 80),
          tagline: parseText(brand.tagline, '', 'Tagline', 180),
          homeHeading: parseText(brand.homeHeading, '', 'Home heading', 120),
          homeSubheading: parseText(brand.homeSubheading, '', 'Home subheading', 300),
        },
        pricing: {
          cardUnlockPricePaise: parsePricePaise(pricing.cardUnlockPriceRupees, 'Card unlock price'),
          deckPassPricePaise: parsePricePaise(pricing.deckPassPriceRupees, 'Deck pass price'),
          deckPassDurationDays: parseDuration(pricing.deckPassDurationDays),
        },
        legal: {
          privacyContact: String(legal.privacyContact ?? '').trim().slice(0, 180),
          termsContact: String(legal.termsContact ?? '').trim().slice(0, 180),
          refundPolicy: String(legal.refundPolicy ?? '').trim().slice(0, 5000),
          privacyPolicy: String(legal.privacyPolicy ?? '').trim().slice(0, 12000),
          termsConditions: String(legal.termsConditions ?? '').trim().slice(0, 12000),
          effectiveDate: String(legal.effectiveDate ?? '').trim().slice(0, 40),
        },
      };

      const saved = await SiteSettings.findOneAndUpdate(
        { key: 'public' },
        { $set: { ...settings, key: 'public' } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );

      await AuditLog.create({
        adminId: req.user?.id,
        adminEmail: req.user?.email || 'admin@system.local',
        adminName: req.user?.name || 'Administrator',
        action: 'UPDATE_SITE_SETTINGS',
        targetType: 'SETTINGS',
        targetId: 'public',
        details: { updatedSections: Object.keys(settings) },
        ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
        userAgent: req.headers['user-agent'] || 'Unknown',
        status: 'SUCCESS',
      });

      res.json({ success: true, message: 'Website settings updated', data: saved });
    } catch (error) {
      next(error);
    }
  }
}
