import mongoose, { Schema, Document } from 'mongoose';
import { CardSuit } from '../types';

export interface ICardDefinition extends Document {
  cardId: string; // e.g. 'DHARMA_K', 'ARTHA_Q', 'MASTER_1'
  suit: CardSuit;
  suitSymbol: string;
  suitName: string;
  suitTheme: string;
  rank: string;
  label: string;
  key: string;
  title: string;
  line: string;
  shortSummary: string;
  detailedInterpretation: string;
  reflectionQuestion: string;
  position: number; // 1 to 55
  isFreeByDefault: boolean;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

const CardDefinitionSchema = new Schema<ICardDefinition>(
  {
    cardId: { type: String, required: true, unique: true, index: true },
    suit: { type: String, required: true, enum: ['Dharma', 'Artha', 'Kama', 'Moksha', 'MasterKey'], index: true },
    suitSymbol: { type: String, required: true },
    suitName: { type: String, required: true },
    suitTheme: { type: String, required: true },
    rank: { type: String, required: true },
    label: { type: String, required: true },
    key: { type: String, required: true, index: true },
    title: { type: String, required: true },
    line: { type: String, default: '' },
    shortSummary: { type: String, required: true },
    detailedInterpretation: { type: String, required: true },
    reflectionQuestion: { type: String, required: true },
    position: { type: Number, required: true, unique: true, index: true },
    isFreeByDefault: { type: Boolean, default: false, index: true },
    category: { type: String, default: 'Major' },
  },
  { timestamps: true }
);

export const CardDefinition = mongoose.model<ICardDefinition>('CardDefinition', CardDefinitionSchema);
