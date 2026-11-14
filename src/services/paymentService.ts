import crypto from 'crypto';
import mongoose from 'mongoose';
import { ENV } from '../config/env';
import { PaymentOrder, IPaymentOrder, PaymentItemType } from '../models/PaymentOrder';
import { PaymentTransaction } from '../models/PaymentTransaction';
import { CardUnlock } from '../models/CardUnlock';
import { CardDefinition } from '../models/CardDefinition';
import { DeckPass } from '../models/DeckPass';
import { WebhookEvent } from '../models/WebhookEvent';
import { RazorpayService, PAYMENT_PRICES } from '../integrations/payments/RazorpayService';
import { EntitlementService, FREE_CARD_KEYS } from './entitlementService';

export class PaymentService {
  private razorpayService: RazorpayService;
  private entitlementService: EntitlementService;

  constructor() {
    this.razorpayService = new RazorpayService();
    this.entitlementService = new EntitlementService();
  }

  /**
   * Create payment order with server-enforced pricing
   */
  public async createPaymentOrder(
    userId: string,
    itemType: PaymentItemType,
    cardKey?: string
  ): Promise<{ order: IPaymentOrder; razorpayKeyId: string }> {
    const uid = new mongoose.Types.ObjectId(userId);
    const entitlements = await this.entitlementService.getUserEntitlements(userId);

    // Rule 1: Free cards cannot be purchased
    if (itemType === 'CARD_UNLOCK' && cardKey && (entitlements.freeCardKeys?.includes(cardKey) || FREE_CARD_KEYS.includes(cardKey))) {
      const err: any = new Error(`Card "${cardKey}" is already free and does not require purchase.`);
      err.statusCode = 400;
      throw err;
    }

    // Rule 2: Active pass holders already have all cards
    if (entitlements.isDeckPassActive) {
      const err: any = new Error('You already have an active 30-Day Deck Pass unlocking all 55 cards.');
      err.statusCode = 400;
      throw err;
    }

    // Rule 3: Check if individual card already unlocked
    if (itemType === 'CARD_UNLOCK' && cardKey && entitlements.unlockedCardKeys.includes(cardKey)) {
      const err: any = new Error(`Card "${cardKey}" is already unlocked.`);
      err.statusCode = 400;
      throw err;
    }

    let amountPaise = this.razorpayService.getPriceForType(itemType);

    // Dynamic price lookup for card unlocks configured in admin panel
    if (itemType === 'CARD_UNLOCK' && cardKey) {
      const cardDef = await CardDefinition.findOne({ key: cardKey });
      if (cardDef && cardDef.price !== undefined && cardDef.price > 0) {
        amountPaise = Math.round(cardDef.price * 100);
      }
    }

    const internalReceipt = `rcpt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Call Razorpay API to create official order with dynamic amount
    const rzpOrder = await this.razorpayService.createOrder(
      internalReceipt,
      itemType,
      {
        userId,
        ...(cardKey && { cardKey }),
      },
      amountPaise
    );

    const paymentOrder = await PaymentOrder.create({
      userId: uid,
      orderId: internalReceipt,
      razorpayOrderId: rzpOrder.id,
      itemType,
      itemId: cardKey,
      amountPaise,
      currency: 'INR',
      status: 'CREATED',
    });

    return {
      order: paymentOrder,
      razorpayKeyId: ENV.RAZORPAY_KEY_ID,
    };
  }

  /**
   * Verify Razorpay payment signature and grant entitlements idempotently
   */
  public async verifyAndGrantAccess(
    userId: string,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
    isWebhookVerified: boolean = false
  ): Promise<{ success: boolean; message: string; passExpiresAt?: Date }> {
    const uid = new mongoose.Types.ObjectId(userId);

    // 1. Fetch order from database
    const order = await PaymentOrder.findOne({ razorpayOrderId, userId: uid });
    if (!order) {
      throw new Error('Payment order not found or does not belong to this user.');
    }

    // Check if already paid (idempotency)
    if (order.status === 'PAID') {
      return { success: true, message: 'Payment has already been verified and processed.' };
    }

    // 2. Verify signature cryptographically
    const isValid =
      isWebhookVerified ||
      this.razorpayService.verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

    if (!isValid) {
      await PaymentTransaction.findOneAndUpdate(
        { razorpayPaymentId },
        {
          $setOnInsert: {
            userId: uid,
            orderId: order.orderId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            amountPaise: order.amountPaise,
            currency: order.currency,
            status: 'TAMPERED',
            rawResponse: { error: 'Invalid HMAC signature' },
            verifiedAt: new Date(),
          },
        },
        { upsert: true }
      );

      order.status = 'FAILED';
      await order.save();
      const error: any = new Error('Cryptographic signature verification failed. Access denied.');
      error.statusCode = 400;
      throw error;
    }

    // 3. Signature is valid! Record transaction idempotently
    await PaymentTransaction.findOneAndUpdate(
      { razorpayPaymentId },
      {
        $setOnInsert: {
          userId: uid,
          orderId: order.orderId,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          amountPaise: order.amountPaise,
          currency: order.currency,
          status: 'SUCCESS',
          verifiedAt: new Date(),
        },
      },
      { upsert: true }
    );

    order.status = 'PAID';
    await order.save();

    let passExpiresAt: Date | undefined;

    // 4. Grant Entitlements Idempotently
    if (order.itemType === 'CARD_UNLOCK' && order.itemId) {
      await CardUnlock.findOneAndUpdate(
        { userId: uid, cardKey: order.itemId },
        {
          $setOnInsert: {
            userId: uid,
            cardKey: order.itemId,
            orderId: order.orderId,
            paymentId: razorpayPaymentId,
            amountPaise: order.amountPaise,
            unlockedAt: new Date(),
          },
        },
        { upsert: true }
      );
    } else if (order.itemType === 'DECK_PASS') {
      const now = new Date();
      passExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days strictly enforced

      await DeckPass.create({
        userId: uid,
        orderId: order.orderId,
        paymentId: razorpayPaymentId,
        passType: '30_DAY_PASS',
        amountPaise: order.amountPaise,
        startsAt: now,
        expiresAt: passExpiresAt,
        isActive: true,
      });
    }

    return {
      success: true,
      message: 'Payment verified successfully and access granted!',
      passExpiresAt,
    };
  }

  /**
   * Handle Razorpay Webhooks idempotently
   */
  public async handleWebhook(
    rawBody: string,
    signature: string,
    eventPayload: any
  ): Promise<{ processed: boolean }> {
    const eventId = eventPayload.id || `evt_${Date.now()}`;
    const eventType = eventPayload.event || 'unknown';

    // Verify signature
    const isSigValid = this.razorpayService.verifyWebhookSignature(rawBody, signature);

    const existing = await WebhookEvent.findOne({ eventId });
    if (existing) {
      return { processed: true }; // already handled
    }

    const webhookRecord = await WebhookEvent.create({
      eventId,
      eventType,
      payload: eventPayload,
      processed: false,
      signatureVerified: isSigValid,
    });

    if (!isSigValid) {
      webhookRecord.error = 'Invalid signature';
      await webhookRecord.save();
      throw new Error('Webhook signature verification failed');
    }

    // Process event
    if (eventType === 'payment.captured' || eventType === 'order.paid') {
      const paymentEntity = eventPayload.payload?.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id;
      const rzpPaymentId = paymentEntity?.id;

      if (rzpOrderId && rzpPaymentId) {
        const order = await PaymentOrder.findOne({ razorpayOrderId: rzpOrderId });
        if (order && order.status !== 'PAID' && order.userId) {
          // Idempotent grant
          await this.verifyAndGrantAccess(
            order.userId.toString(),
            rzpOrderId,
            rzpPaymentId,
            'webhook_verified',
            true
          );
        }
      }
    }

    webhookRecord.processed = true;
    webhookRecord.processedAt = new Date();
    await webhookRecord.save();

    return { processed: true };
  }

  /**
   * Get payment history for authenticated user
   */
  public async getUserPaymentHistory(userId: string): Promise<any[]> {
    const uid = new mongoose.Types.ObjectId(userId);
    const orders = await PaymentOrder.find({ userId: uid }).sort({ createdAt: -1 });
    const transactions = await PaymentTransaction.find({ userId: uid }).sort({ verifiedAt: -1 });

    return orders.map((o) => {
      const tx = transactions.find((t) => t.orderId === o.orderId);
      return {
        orderId: o.orderId,
        itemType: o.itemType,
        itemId: o.itemId,
        amount: o.amountPaise / 100, // display in ₹
        currency: o.currency,
        status: o.status,
        createdAt: o.createdAt,
        paymentId: tx?.razorpayPaymentId || null,
        verifiedAt: tx?.verifiedAt || null,
      };
    });
  }
}
