import mongoose, { Schema, Document } from 'mongoose';

export interface IBirthProfile extends Document {
  userId?: mongoose.Types.ObjectId;
  guestSessionId?: string;
  name: string;
  gender?: string;
  dateOfBirth: string; // YYYY-MM-DD
  timeOfBirth: string; // HH:mm:ss
  place: string;
  latitude: number;
  longitude: number;
  timezone: number; // e.g. 5.5
  ianaTimezone?: string;
  utcDateTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BirthProfileSchema = new Schema<IBirthProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    guestSessionId: { type: String, index: true, sparse: true },
    name: { type: String, required: true, trim: true },
    gender: { type: String, required: true, trim: true },
    dateOfBirth: { type: String, required: true },
    timeOfBirth: { type: String, required: true },
    place: { type: String, required: true, trim: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timezone: { type: Number, required: true },
    ianaTimezone: { type: String },
    utcDateTime: { type: Date, required: true },
  },
  { timestamps: true }
);

BirthProfileSchema.index({ userId: 1, createdAt: -1 });

export const BirthProfile = mongoose.model<IBirthProfile>('BirthProfile', BirthProfileSchema);
