import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { PaymentService } from '../services/paymentService';
import { createOrderSchema, verifyPaymentSchema } from '../validators/paymentValidators';

const paymentService = new PaymentService();

export class PaymentController {
  public async createOrder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Please create an account or sign in to complete your purchase.',
        });
        return;
      }

      const validated = createOrderSchema.parse(req.body);
      const { order, razorpayKeyId } = await paymentService.createPaymentOrder(
        req.user.id,
        validated.itemType,
        validated.cardKey
      );

      res.status(201).json({
        success: true,
        message: 'Payment order created',
        data: {
          orderId: order.orderId,
          razorpayOrderId: order.razorpayOrderId,
          amount: order.amountPaise,
          amountRupees: order.amountPaise / 100,
          currency: order.currency,
          itemType: order.itemType,
          itemId: order.itemId,
          razorpayKeyId,
        },
      });
    } catch (err: any) {
      console.error('💥 PaymentController.createOrder error:', err.message);
      next(err);
    }
  }

  public async verifyPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const validated = verifyPaymentSchema.parse(req.body);
      const result = await paymentService.verifyAndGrantAccess(
        req.user.id,
        validated.razorpayOrderId,
        validated.razorpayPaymentId,
        validated.razorpaySignature
      );

      res.json({
        success: true,
        message: result.message,
        data: {
          passExpiresAt: result.passExpiresAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      await paymentService.handleWebhook(rawBody, signature || '', req.body);

      res.json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  }

  public async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      const history = await paymentService.getUserPaymentHistory(req.user.id);
      res.json({
        success: true,
        count: history.length,
        data: history,
      });
    } catch (err) {
      next(err);
    }
  }
}
