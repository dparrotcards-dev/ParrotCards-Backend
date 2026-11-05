import mongoose, { Schema, Document } from 'mongoose';

export interface ICardUnlock extends Document {
  userId: mongoose.Types.ObjectId;
  cardKey: string;
  orderId: string;
  paymentId: string;
  amountPaise: number;
  unlockedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CardUnlockSchema = new Schema<ICardUnlock>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cardKey: { type: String, required: true, index: true },
    orderId: { type: String, required: true },
    paymentId: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    unlockedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Prevent duplicate card unlock for same user and card
CardUnlockSchema.index({ userId: 1, cardKey: 1 }, { unique: true });

export const CardUnlock = mongoose.model<ICardUnlock>('CardUnlock', CardUnlockSchema);
