import { Request, Response, NextFunction } from 'express';
import { ContactMessage } from '../models/ContactMessage';

export class ContactMessageController {
  // Public: Submit message from Contact Us / Support Page
  public createMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, phone, subject, message } = req.body;
      if (!name || !email || !subject || !message) {
        return res.status(400).json({
          status: 'error',
          message: 'Name, email, subject and message are required fields.',
        });
      }

      const newMsg = await ContactMessage.create({
        name,
        email,
        phone: phone || '',
        subject,
        message,
        status: 'Pending',
      });

      return res.status(201).json({
        status: 'success',
        message: 'Message sent successfully. Our support team will review and respond soon.',
        data: newMsg,
      });
    } catch (error) {
      next(error);
    }
  };

  // Admin: Get all real user messages with filtering, searching, stats and pagination
  public getMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const status = req.query.status as string;
      const search = req.query.search as string;
      const dateRange = req.query.dateRange as string;

      const filter: any = {};

      if (status && status !== 'all' && status !== 'All') {
        filter.status = status;
      }

      if (search && search.trim()) {
        const query = search.trim();
        filter.$or = [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { subject: { $regex: query, $options: 'i' } },
          { message: { $regex: query, $options: 'i' } },
          { phone: { $regex: query, $options: 'i' } },
        ];
      }

      if (dateRange && dateRange !== 'all' && dateRange !== 'All') {
        const now = new Date();
        if (dateRange === 'today') {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          filter.createdAt = { $gte: startOfToday };
        } else if (dateRange === 'week' || dateRange === '7days') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          filter.createdAt = { $gte: sevenDaysAgo };
        } else if (dateRange === 'month' || dateRange === '30days') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          filter.createdAt = { $gte: thirtyDaysAgo };
        }
      }

      const total = await ContactMessage.countDocuments(filter);
      const messages = await ContactMessage.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      // Overall stats based only on real messages
      const totalMessages = await ContactMessage.countDocuments();
      const replied = await ContactMessage.countDocuments({ status: 'Replied' });
      const pending = await ContactMessage.countDocuments({ status: 'Pending' });

      return res.json({
        status: 'success',
        data: {
          messages,
          pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 1,
          },
          stats: {
            totalMessages,
            replied,
            pending,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Admin: Reply to a message
  public replyToMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { replyText, markAsRepliedOnly } = req.body;

      const message = await ContactMessage.findById(id);
      if (!message) {
        return res.status(404).json({
          status: 'error',
          message: 'Contact message not found.',
        });
      }

      message.status = 'Replied';
      if (!markAsRepliedOnly && replyText) {
        message.replyText = replyText;
      }
      message.repliedAt = new Date();
      await message.save();

      return res.json({
        status: 'success',
        message: markAsRepliedOnly ? 'Message marked as replied.' : 'Reply sent to customer successfully.',
        data: message,
      });
    } catch (error) {
      next(error);
    }
  };

  // Admin: Update status directly
  public updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status || !['Pending', 'Replied'].includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Valid status ("Pending" or "Replied") is required.',
        });
      }

      const message = await ContactMessage.findByIdAndUpdate(
        id,
        { status, ...(status === 'Replied' ? { repliedAt: new Date() } : {}) },
        { new: true }
      );

      if (!message) {
        return res.status(404).json({
          status: 'error',
          message: 'Contact message not found.',
        });
      }

      return res.json({
        status: 'success',
        message: `Message status updated to ${status}.`,
        data: message,
      });
    } catch (error) {
      next(error);
    }
  };

  // Admin: Delete a message
  public deleteMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const deleted = await ContactMessage.findByIdAndDelete(id);
      if (!deleted) {
        return res.status(404).json({
          status: 'error',
          message: 'Contact message not found.',
        });
      }

      return res.json({
        status: 'success',
        message: 'Message deleted successfully.',
      });
    } catch (error) {
      next(error);
    }
  };
}
