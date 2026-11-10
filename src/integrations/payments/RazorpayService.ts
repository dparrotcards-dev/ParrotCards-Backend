import crypto from 'crypto';
import Razorpay from 'razorpay';
import { ENV } from '../../config/env';
import { PaymentItemType } from '../../models/PaymentOrder';

export const PAYMENT_PRICES = {
  CARD_UNLOCK: 200, // ₹2 in paise
  DECK_PASS: 2500, // ₹25 in paise
} as const;

export class RazorpayService {
  private razorpay: Razorpay;
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor() {
    this.keyId = ENV.RAZORPAY_KEY_ID;
    this.keySecret = ENV.RAZORPAY_KEY_SECRET;
    this.webhookSecret = ENV.RAZORPAY_WEBHOOK_SECRET;

    this.razorpay = new Razorpay({
      key_id: this.keyId,
      key_secret: this.keySecret,
    });
  }

  /**
   * Return server-enforced price in paise for item type
   */
  public getPriceForType(itemType: PaymentItemType): number {
    if (itemType === 'CARD_UNLOCK') return PAYMENT_PRICES.CARD_UNLOCK;
    if (itemType === 'DECK_PASS') return PAYMENT_PRICES.DECK_PASS;
    throw new Error(`Unsupported item type: ${itemType}`);
  }

  /**
   * Create Razorpay order on server
   */
  public async createOrder(
    receiptId: string,
    itemType: PaymentItemType,
    notes: Record<string, string> = {}
  ): Promise<{ id: string; amount: number; currency: string }> {
    const isTestEnv = process.env.NODE_ENV === 'test' || ENV.NODE_ENV === 'test';
    const hasPlaceholderCredentials =
      this.keyId === 'rzp_test_ParrotCardsKey' ||
      this.keySecret === 'rzp_test_ParrotCardsSecret' ||
      this.keySecret.startsWith('replace_with_');

    if (!isTestEnv && (!this.keyId || !this.keySecret || hasPlaceholderCredentials)) {
      throw new Error(
        'Razorpay test credentials are incomplete. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Backend/.env.'
      );
    }

    const amount = this.getPriceForType(itemType);

    try {
      const order = await this.razorpay.orders.create({
        amount,
        currency: 'INR',
        receipt: receiptId,
        notes: {
          ...notes,
          itemType,
        },
      });

      return {
        id: order.id,
        amount: Number(order.amount),
        currency: order.currency,
      };
    } catch (err: any) {
      // Simulated mock orders are strictly restricted to explicitly configured automated test execution (NODE_ENV === 'test')
      if (isTestEnv) {
        const mockOrderId = `order_sim_${crypto.randomBytes(8).toString('hex')}`;
        return {
          id: mockOrderId,
          amount,
          currency: 'INR',
        };
      }
      throw new Error(`Razorpay order creation failed: ${err.message}`);
    }
  }

  /**
   * Verify Razorpay payment signature cryptographically
   */
  public verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    const isTestEnv = process.env.NODE_ENV === 'test' || ENV.NODE_ENV === 'test';
    // Simulated signatures are strictly restricted to automated tests (NODE_ENV === 'test')
    if (orderId.startsWith('order_sim_')) {
      if (isTestEnv && signature === 'simulated_valid_sig') {
        return true;
      }
      return false;
    }

    try {
      const body = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(body)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    } catch (err) {
      return false;
    }
  }

  /**
   * Verify webhook event signature
   */
  public verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    if (
      !this.webhookSecret ||
      this.webhookSecret === 'rzp_test_webhook_secret' ||
      this.webhookSecret.startsWith('replace_with_')
    ) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody)
        .digest('hex');

      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signatureHeader));
    } catch {
      return false;
    }
  }
}
