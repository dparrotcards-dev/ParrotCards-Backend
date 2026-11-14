import mongoose, { Schema, Document } from 'mongoose';

export type PaymentItemType = 'CARD_UNLOCK' | 'DECK_PASS';
export type PaymentOrderStatus = 'CREATED' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface IPaymentOrder extends Document {
  userId?: mongoose.Types.ObjectId;
  guestSessionId?: string;
  orderId: string; // Internal Order ID
  razorpayOrderId: string;
  itemType: PaymentItemType;
  itemId?: string; // cardKey if CARD_UNLOCK
  amountPaise: number;
  currency: string;
  status: PaymentOrderStatus;
  paymentMethod?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentOrderSchema = new Schema<IPaymentOrder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    guestSessionId: { type: String, index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    razorpayOrderId: { type: String, required: true, unique: true, index: true },
    itemType: { type: String, enum: ['CARD_UNLOCK', 'DECK_PASS'], required: true },
    itemId: { type: String },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['CREATED', 'PAID', 'FAILED', 'EXPIRED'], default: 'CREATED', index: true },
    paymentMethod: { type: String },
  },
  { timestamps: true }
);

export const PaymentOrder = mongoose.model<IPaymentOrder>('PaymentOrder', PaymentOrderSchema);
