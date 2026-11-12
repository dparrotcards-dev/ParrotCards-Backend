import mongoose, { Schema, Document } from 'mongoose';

export interface ISiteSettings extends Document {
  key: 'public';
  brand: {
    name: string;
    tagline: string;
    homeHeading: string;
    homeSubheading: string;
  };
  pricing: {
    cardUnlockPricePaise: number;
    deckPassPricePaise: number;
    deckPassDurationDays: number;
  };
  legal: {
    privacyContact: string;
    termsContact: string;
    refundPolicy: string;
    privacyPolicy: string;
    termsConditions: string;
    effectiveDate: string;
  };
  updatedAt: Date;
}

const SiteSettingsSchema = new Schema<ISiteSettings>(
  {
    key: { type: String, enum: ['public'], required: true, unique: true },
    brand: {
      name: { type: String, required: true, trim: true, maxlength: 80 },
      tagline: { type: String, required: true, trim: true, maxlength: 180 },
      homeHeading: { type: String, required: true, trim: true, maxlength: 120 },
      homeSubheading: { type: String, required: true, trim: true, maxlength: 300 },
    },
    pricing: {
      cardUnlockPricePaise: { type: Number, required: true, min: 100, max: 10000000 },
      deckPassPricePaise: { type: Number, required: true, min: 100, max: 10000000 },
      deckPassDurationDays: { type: Number, required: true, min: 1, max: 3650 },
    },
    legal: {
      privacyContact: { type: String, default: '', trim: true, maxlength: 180 },
      termsContact: { type: String, default: '', trim: true, maxlength: 180 },
      refundPolicy: { type: String, default: '', trim: true, maxlength: 5000 },
      privacyPolicy: { type: String, default: '', trim: true, maxlength: 12000 },
      termsConditions: { type: String, default: '', trim: true, maxlength: 12000 },
      effectiveDate: { type: String, default: '', trim: true, maxlength: 40 },
    },
  },
  { timestamps: true }
);

export const DEFAULT_SITE_SETTINGS = {
  key: 'public' as const,
  brand: {
    name: 'Parrot Cards',
    tagline: 'Draw the deck your birth sky dealt you.',
    homeHeading: 'Discover the wisdom of your birth sky',
    homeSubheading: 'A personal journey through Vedic astrology and the 55-card deck.',
  },
  pricing: {
    cardUnlockPricePaise: 200,
    deckPassPricePaise: 2500,
    deckPassDurationDays: 30,
  },
  legal: {
    privacyContact: '',
    termsContact: '',
    refundPolicy: '',
    privacyPolicy: '',
    termsConditions: '',
    effectiveDate: '',
  },
};

export const SiteSettings = mongoose.model<ISiteSettings>('SiteSettings', SiteSettingsSchema);
