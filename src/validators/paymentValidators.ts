import { z } from 'zod';

export const createOrderSchema = z.object({
  itemType: z.enum(['CARD_UNLOCK', 'DECK_PASS']),
  cardKey: z.string().optional(),
}).refine((data) => {
  if (data.itemType === 'CARD_UNLOCK' && !data.cardKey) {
    return false;
  }
  return true;
}, {
  message: 'cardKey is required for CARD_UNLOCK',
  path: ['cardKey'],
});

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1, 'Razorpay order ID is required'),
  razorpayPaymentId: z.string().min(1, 'Razorpay payment ID is required'),
  razorpaySignature: z.string().min(1, 'Razorpay signature is required'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
