import mongoose, { Schema, Document } from 'mongoose';

export interface IStoreOrderItem {
  productId?: string;
  name: string;
  category?: string;
  priceRupees: number;
  quantity: number;
  imageUrl?: string;
}

export type StoreOrderStatus = 'Confirmed' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';

export interface IStoreOrder extends Document {
  orderId: string;
  userId?: mongoose.Types.ObjectId;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: {
    fullName: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  products: IStoreOrderItem[];
  totalAmountRupees: number;
  paymentMethod: string;
  paymentStatus: 'PAID' | 'PENDING' | 'FAILED';
  status: StoreOrderStatus;
  courierName?: string;
  trackingNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StoreOrderItemSchema = new Schema(
  {
    productId: { type: String },
    name: { type: String, required: true },
    category: { type: String },
    priceRupees: { type: Number, required: true },
    quantity: { type: Number, required: true, default: 1 },
    imageUrl: { type: String },
  },
  { _id: false }
);

const StoreOrderSchema = new Schema<IStoreOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    customerPhone: { type: String, default: '' },
    shippingAddress: {
      fullName: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      address: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
    },
    products: [StoreOrderItemSchema],
    totalAmountRupees: { type: Number, required: true },
    paymentMethod: { type: String, default: 'Online' },
    paymentStatus: { type: String, enum: ['PAID', 'PENDING', 'FAILED'], default: 'PAID' },
    status: {
      type: String,
      enum: ['Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
      default: 'Confirmed',
      index: true,
    },
    courierName: { type: String },
    trackingNumber: { type: String },
  },
  { timestamps: true }
);

StoreOrderSchema.index({ createdAt: -1 });

export const StoreOrder = mongoose.model<IStoreOrder>('StoreOrder', StoreOrderSchema);

