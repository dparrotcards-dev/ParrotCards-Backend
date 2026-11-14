import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentTransaction extends Document {
  userId?: mongoose.Types.ObjectId;
  guestSessionId?: string;
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  amountPaise: number;
  currency: string;
  status: 'SUCCESS' | 'FAILED' | 'TAMPERED';
  paymentMethod?: string;
  rawResponse?: Record<string, any>;
  verifiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    guestSessionId: { type: String, index: true },
    orderId: { type: String, required: true, index: true },
    razorpayOrderId: { type: String, required: true },
    razorpayPaymentId: { type: String, required: true, unique: true, index: true },
    razorpaySignature: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['SUCCESS', 'FAILED', 'TAMPERED'], required: true },
    paymentMethod: { type: String },
    rawResponse: { type: Schema.Types.Mixed },
    verifiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const PaymentTransaction = mongoose.model<IPaymentTransaction>(
  'PaymentTransaction',
  PaymentTransactionSchema
);
