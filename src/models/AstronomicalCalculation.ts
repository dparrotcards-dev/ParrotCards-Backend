import mongoose, { Schema, Document } from 'mongoose';

export interface IAstronomicalCalculation extends Document {
  profileId: mongoose.Types.ObjectId;
  provider: string; // 'jagannatha_hora' | 'local_verified'
  calculationVersion: string;
  inputSnapshot: {
    date: string;
    time: string;
    place: string;
    latitude: number;
    longitude: number;
    timezone: number;
    utcDateTime: Date;
  };
  rawHoroscope: Record<string, any>;
  parsedPoints: Record<string, any>;
  lagSign: number | null;
  akPlanet: string | null;
  foundPointsCount: number;
  totalPointsCount: number;
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AstronomicalCalculationSchema = new Schema<IAstronomicalCalculation>(
  {
    profileId: { type: Schema.Types.ObjectId, ref: 'BirthProfile', required: true, index: true },
    provider: { type: String, required: true },
    calculationVersion: { type: String, default: '1.0.0' },
    inputSnapshot: {
      date: { type: String, required: true },
      time: { type: String, required: true },
      place: { type: String, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      timezone: { type: Number, required: true },
      utcDateTime: { type: Date, required: true },
    },
    rawHoroscope: { type: Schema.Types.Mixed, default: {} },
    parsedPoints: { type: Schema.Types.Mixed, default: {} },
    lagSign: { type: Number, default: null },
    akPlanet: { type: String, default: null },
    foundPointsCount: { type: Number, default: 0 },
    totalPointsCount: { type: Number, default: 0 },
    calculatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

AstronomicalCalculationSchema.index({ profileId: 1, calculatedAt: -1 });

export const AstronomicalCalculation = mongoose.model<IAstronomicalCalculation>(
  'AstronomicalCalculation',
  AstronomicalCalculationSchema
);
