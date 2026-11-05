import mongoose, { Schema, Document } from 'mongoose';
import { CardSuit, IAstronomicalPlacement } from '../types';

export interface IPersonalizedCard extends Document {
  deckId: mongoose.Types.ObjectId;
  cardDefId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  guestSessionId?: string;
  cardId: string;
  suit: CardSuit;
  suitSymbol: string;
  rank: string;
  label: string;
  key: string;
  title: string;
  line: string;
  shortSummary: string;
  position: number;
  astronomicalPlacement: IAstronomicalPlacement;
  isSovereign: boolean;
  isFree: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PersonalizedCardSchema = new Schema<IPersonalizedCard>(
  {
    deckId: { type: Schema.Types.ObjectId, ref: 'PersonalizedDeck', required: true, index: true },
    cardDefId: { type: Schema.Types.ObjectId, ref: 'CardDefinition', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, sparse: true },
    guestSessionId: { type: String, index: true, sparse: true },
    cardId: { type: String, required: true },
    suit: { type: String, required: true },
    suitSymbol: { type: String, required: true },
    rank: { type: String, required: true },
    label: { type: String, required: true },
    key: { type: String, required: true, index: true },
    title: { type: String, required: true },
    line: { type: String, default: '' },
    shortSummary: { type: String, required: true },
    position: { type: Number, required: true },
    astronomicalPlacement: {
      sign: { type: Number, default: null },
      signName: { type: String, default: null },
      deg: { type: Number, default: null },
      house: { type: Number, default: null },
      nak: { type: String, default: null },
      pada: { type: Number, default: null },
      lord: { type: String, default: null },
      nadi: { type: String, default: null },
      ruler: { type: String, default: null },
      kar: {
        code: { type: String, default: null },
        name: { type: String, default: null },
      },
      state: { type: String, default: null },
      isSovereign: { type: Boolean, default: false },
      navamshaSign: { type: Number, default: null },
      navamshaSignName: { type: String, default: null },
      houseLord: { type: String, default: null },
    },
    isSovereign: { type: Boolean, default: false },
    isFree: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PersonalizedCardSchema.index({ deckId: 1, position: 1 });
PersonalizedCardSchema.index({ deckId: 1, key: 1 });

export const PersonalizedCard = mongoose.model<IPersonalizedCard>('PersonalizedCard', PersonalizedCardSchema);
