import mongoose, { Schema, Document } from 'mongoose';

export interface ICardInterpretation extends Document {
  userId?: mongoose.Types.ObjectId;
  cardKey: string;
  cacheHash: string;
  sovereignAvatarPhrase?: string;
  deeperExplanation: string;
  reflectionPrompt: string;
  dharmaConnection: string;
  practicalAction: string;
  isAiGenerated: boolean;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CardInterpretationSchema = new Schema<ICardInterpretation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    cardKey: { type: String, required: true, index: true },
    cacheHash: { type: String, required: true, index: true },
    sovereignAvatarPhrase: { type: String },
    deeperExplanation: { type: String, required: true },
    reflectionPrompt: { type: String, required: true },
    dharmaConnection: { type: String, default: '' },
    practicalAction: { type: String, default: '' },
    isAiGenerated: { type: Boolean, default: true },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

CardInterpretationSchema.index({ cacheHash: 1, cardKey: 1 }, { unique: true });

export const CardInterpretation = mongoose.model<ICardInterpretation>('CardInterpretation', CardInterpretationSchema);
