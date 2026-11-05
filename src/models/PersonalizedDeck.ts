import mongoose, { Schema, Document } from 'mongoose';

export interface IPersonalizedDeck extends Document {
  userId?: mongoose.Types.ObjectId;
  guestSessionId?: string;
  profileId: mongoose.Types.ObjectId;
  calculationId: mongoose.Types.ObjectId;
  sovereignCardKey: string;
  avatarPhrase: string;
  avatarSummary: string;
  isAvatarAiGenerated?: boolean;
  totalCards: number; // 55
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PersonalizedDeckSchema = new Schema<IPersonalizedDeck>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    guestSessionId: { type: String, index: true, sparse: true },
    profileId: { type: Schema.Types.ObjectId, ref: 'BirthProfile', required: true, index: true },
    calculationId: { type: Schema.Types.ObjectId, ref: 'AstronomicalCalculation', required: true },
    sovereignCardKey: { type: String, required: true },
    avatarPhrase: { type: String, required: true },
    avatarSummary: { type: String, default: '' },
    isAvatarAiGenerated: { type: Boolean, default: false },
    totalCards: { type: Number, default: 55 },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

PersonalizedDeckSchema.index({ profileId: 1, createdAt: -1 });

export const PersonalizedDeck = mongoose.model<IPersonalizedDeck>('PersonalizedDeck', PersonalizedDeckSchema);
