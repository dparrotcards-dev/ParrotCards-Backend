import mongoose, { Schema, Document } from 'mongoose';

export interface IDeckPass extends Document {
  userId: mongoose.Types.ObjectId;
  orderId: string;
  paymentId: string;
  passType: '30_DAY_PASS';
  amountPaise: number;
  startsAt: Date;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DeckPassSchema = new Schema<IDeckPass>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: String, required: true },
    paymentId: { type: String, required: true },
    passType: { type: String, enum: ['30_DAY_PASS'], default: '30_DAY_PASS' },
    amountPaise: { type: Number, required: true },
    startsAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

DeckPassSchema.index({ userId: 1, expiresAt: -1 });

export const DeckPass = mongoose.model<IDeckPass>('DeckPass', DeckPassSchema);
