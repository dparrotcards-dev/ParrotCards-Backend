import mongoose, { Schema, Document } from 'mongoose';

export type ProductBadge = 'None' | 'Bestseller' | 'Trending' | 'Recommended' | 'New Arrival';
export type ProductCategory = 'Gemstones' | 'Rudraksha' | 'Yantra' | 'Astrology Books' | 'Spiritual Accessories';

export interface ICosmicProduct extends Document {
  name: string;
  shortDescription: string;
  pricePaise: number;
  mrpPaise: number;
  badge: ProductBadge;
  category: ProductCategory;
  imageUrl: string;
  discountPercent: number;
  isActive: boolean;
  inStock: boolean;
  rating: number;
  ratingCount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CosmicProductSchema = new Schema<ICosmicProduct>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    shortDescription: { type: String, required: true, trim: true, maxlength: 120 },
    pricePaise: { type: Number, required: true, min: 100 },
    mrpPaise: { type: Number, required: true, min: 100 },
    badge: {
      type: String,
      enum: ['None', 'Bestseller', 'Trending', 'Recommended', 'New Arrival'],
      default: 'None',
    },
    category: {
      type: String,
      enum: ['Gemstones', 'Rudraksha', 'Yantra', 'Astrology Books', 'Spiritual Accessories'],
      required: true,
      index: true,
    },
    imageUrl: { type: String, required: true },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    isActive: { type: Boolean, default: true, index: true },
    inStock: { type: Boolean, default: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

CosmicProductSchema.pre('save', function (next) {
  if (this.mrpPaise > 0 && this.pricePaise > 0 && this.mrpPaise >= this.pricePaise) {
    this.discountPercent = Math.round(((this.mrpPaise - this.pricePaise) / this.mrpPaise) * 100);
  } else {
    this.discountPercent = 0;
  }
  next();
});

CosmicProductSchema.index({ createdAt: -1 });
CosmicProductSchema.index({ category: 1, isActive: 1 });

export const CosmicProduct = mongoose.model<ICosmicProduct>('CosmicProduct', CosmicProductSchema);
