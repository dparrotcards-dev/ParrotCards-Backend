import { Request, Response, NextFunction } from 'express';
import { ContactMessage, IContactMessage } from '../models/ContactMessage';

const INITIAL_MESSAGES = [
  {
    name: 'Varun Menariya',
    email: 'varun@gmail.com',
    phone: '+91 98765 43210',
    subject: 'Order Related Query',
    message:
      'Hi Team,\nI have placed an order #PC71999, but I have not received any update yet. Please let me know the current status of my order.',
    status: 'Pending',
    createdAt: new Date('2026-11-17T14:45:00+05:30'),
  },
  {
    name: 'Rohit Sharma',
    email: 'rohit.sharma@gmail.com',
    phone: '+91 98221 44556',
    subject: 'Product Availability',
    message:
      'Hello, when will the 5-Mukhi Indonesian Rudraksha Mala be back in stock in the Cosmic Store?',
    status: 'Pending',
    createdAt: new Date('2026-11-17T13:20:00+05:30'),
  },
  {
    name: 'Pooja Mehta',
    email: 'pooja.mehta@gmail.com',
    phone: '+91 97112 33445',
    subject: 'Payment Issue',
    message:
      'Amount was deducted from my bank but the 30-Day Deck Pass was delayed by a minute. Everything seems resolved now, thank you.',
    status: 'Replied',
    replyText: 'Dear Pooja, your transaction has been confirmed and pass is active. Best regards, Parrot Cards Support.',
    repliedAt: new Date('2026-11-16T18:45:00+05:30'),
    createdAt: new Date('2026-11-16T18:18:00+05:30'),
  },
  {
    name: 'Amit Joshi',
    email: 'amit.joshi@gmail.com',
    phone: '+91 94140 12890',
    subject: 'Card Customization',
    message:
      'Can I request custom astrological readings for my family charts along with the standard deck?',
    status: 'Pending',
    createdAt: new Date('2026-11-16T11:02:00+05:30'),
  },
  {
    name: 'Neha Gupta',
    email: 'neha.gupta@gmail.com',
    phone: '+91 96500 77123',
    subject: 'Delivery Time',
    message:
      'How many days will it take for delivery in Mumbai after placing a store order?',
    status: 'Replied',
    replyText: 'Deliveries to Mumbai typically arrive within 2-3 business days via Blue Dart.',
    repliedAt: new Date('2026-11-15T18:10:00+05:30'),
    createdAt: new Date('2026-11-15T17:40:00+05:30'),
  },
  {
    name: 'Kunal Singh',
    email: 'kunal.singh@gmail.com',
    phone: '+91 98990 66554',
    subject: 'Bulk Order Inquiry',
    message:
      'We want to place an order of 25 sanctified pyramid sets for a corporate spiritual workshop.',
    status: 'Pending',
    createdAt: new Date('2026-11-15T12:06:00+05:30'),
  },
  {
    name: 'Riya Verma',
    email: 'riya.verma@gmail.com',
    phone: '+91 99100 88234',
    subject: 'Return & Refund',
    message:
      'My crystal arrived in damaged packaging, I have sent photographs for replacement.',
    status: 'Replied',
    replyText: 'Replacement dispatched with tracking number BD772910. Apologies for the inconvenience.',
    repliedAt: new Date('2026-11-14T17:00:00+05:30'),
    createdAt: new Date('2026-11-14T16:22:00+05:30'),
  },
  {
    name: 'Sandeep Rawat',
    email: 'sandeep.rawat@gmail.com',
    phone: '+91 98200 44321',
    subject: 'Partnership / Business',
    message:
      'Inquiry regarding retail partnership for distributing Vedic cards in spiritual retreat centers.',
    status: 'Pending',
    createdAt: new Date('2026-11-14T11:58:00+05:30'),
  },
  {
    name: 'Mayank Jain',
    email: 'mayank.jain@gmail.com',
    phone: '+91 97654 32109',
    subject: 'Technical Issue',
    message:
      'Encountered a loading loop while calculating astronomical degrees on Safari browser.',
    status: 'Replied',
    replyText: 'Issue has been patched in version 1.0.4. Please refresh your browser cache.',
    repliedAt: new Date('2026-11-13T20:30:00+05:30'),
    createdAt: new Date('2026-11-13T19:17:00+05:30'),
  },
  {
    name: 'Priya Singh',
    email: 'priya.singh@gmail.com',
    phone: '+91 98331 22445',
    subject: 'Other Query',
    message:
      'Need assistance regarding the planetary transitions of the 12th house in my deck.',
    status: 'Pending',
    createdAt: new Date('2026-11-13T15:09:00+05:30'),
  },
  {
    name: 'Ananya Sharma',
    email: 'ananya.s@gmail.com',
    phone: '+91 98112 00998',
    subject: 'General Inquiry',
    message: 'Can I gift a 30-Day Deck Pass subscription to my friend?',
    status: 'Replied',
    replyText: 'Yes, gifting passes will be available in the upcoming update. You can also share access credentials.',
    repliedAt: new Date('2026-11-13T12:00:00+05:30'),
    createdAt: new Date('2026-11-13T10:15:00+05:30'),
  },
  {
    name: 'Vikram Rajput',
    email: 'vikram.r@gmail.com',
    phone: '+91 98711 33221',
    subject: 'Cosmic Store Order & Products',
    message: 'Is the Rudraksha energized with mantras before dispatch?',
    status: 'Replied',
    replyText: 'Yes, all store artifacts are energized and sanctified according to authentic Vedic rituals.',
    repliedAt: new Date('2026-11-12T16:00:00+05:30'),
    createdAt: new Date('2026-11-12T14:30:00+05:30'),
  },
  {
    name: 'Deepak Chouhan',
    email: 'deepak.c@gmail.com',
    phone: '+91 98290 88776',
    subject: 'Astronomical Sky Calculations & Lagna',
    message: 'How accurate are the planetary coordinates compared to NASA ephemeris?',
    status: 'Replied',
    replyText: 'Our engine uses the Swiss Ephemeris JPL DE431 integration providing 99.999% precision.',
    repliedAt: new Date('2026-11-12T11:45:00+05:30'),
    createdAt: new Date('2026-11-12T09:20:00+05:30'),
  },
  {
    name: 'Shreya Kapoor',
    email: 'shreya.k@gmail.com',
    phone: '+91 99887 66554',
    subject: 'Deck & Card Interpretations',
    message: 'Loved the Rahu-Ketu axis interpretation! Very insightful.',
    status: 'Replied',
    replyText: 'Thank you for the warm feedback Shreya! May your deck bring wisdom and clarity.',
    repliedAt: new Date('2026-11-11T17:30:00+05:30'),
    createdAt: new Date('2026-11-11T16:00:00+05:30'),
  },
  {
    name: 'Arjun Das',
    email: 'arjun.das@gmail.com',
    phone: '+91 97110 55443',
    subject: 'Bulk Order Inquiry',
    message: 'Requesting quotation for 15 Vedic copper yantras for our meditation center.',
    status: 'Pending',
    createdAt: new Date('2026-11-11T11:15:00+05:30'),
  },
  {
    name: 'Kavita Nair',
    email: 'kavita.nair@gmail.com',
    phone: '+91 98450 11223',
    subject: 'Payment Issue',
    message: 'UPI transaction timed out while buying pass. Requesting reconciliation.',
    status: 'Replied',
    replyText: 'Payment reconciled and pass activated. Transaction ref: pay_UPI9901.',
    repliedAt: new Date('2026-11-10T19:00:00+05:30'),
    createdAt: new Date('2026-11-10T18:05:00+05:30'),
  },
  {
    name: 'Manoj Tiwari',
    email: 'manoj.tiwari@gmail.com',
    phone: '+91 98101 22334',
    subject: 'Product Availability',
    message: 'Are pure brass singing bowls going to be available soon?',
    status: 'Pending',
    createdAt: new Date('2026-11-10T13:40:00+05:30'),
  },
  {
    name: 'Meera Pillai',
    email: 'meera.pillai@gmail.com',
    phone: '+91 94470 99887',
    subject: 'Technical Support',
    message: 'Can I export my generated birth sky chart as a PDF?',
    status: 'Replied',
    replyText: 'Yes, click the export icon in the top right of your chart to download a high-res PDF.',
    repliedAt: new Date('2026-11-09T15:20:00+05:30'),
    createdAt: new Date('2026-11-09T14:10:00+05:30'),
  },
  {
    name: 'Gaurav Singhal',
    email: 'gaurav.s@gmail.com',
    phone: '+91 98912 33445',
    subject: 'Order Related Query',
    message: 'Can I change my delivery address for order #PC72110?',
    status: 'Replied',
    replyText: 'Address updated before shipment dispatched. Thank you.',
    repliedAt: new Date('2026-11-09T10:45:00+05:30'),
    createdAt: new Date('2026-11-09T09:30:00+05:30'),
  },
  {
    name: 'Tanvi Shah',
    email: 'tanvi.shah@gmail.com',
    phone: '+91 98201 55667',
    subject: 'General Inquiry',
    message: 'Do you offer one-on-one Vedic consultations with master astrologers?',
    status: 'Replied',
    replyText: 'Consultation booking will launch next month. Stay tuned via our newsletter.',
    repliedAt: new Date('2026-11-08T16:15:00+05:30'),
    createdAt: new Date('2026-11-08T15:00:00+05:30'),
  },
  {
    name: 'Rohan Bose',
    email: 'rohan.bose@gmail.com',
    phone: '+91 98300 77665',
    subject: 'Delivery Time',
    message: 'Urgent delivery required for wedding gift in Kolkata.',
    status: 'Pending',
    createdAt: new Date('2026-11-08T11:20:00+05:30'),
  },
  {
    name: 'Simran Walia',
    email: 'simran.w@gmail.com',
    phone: '+91 98150 44332',
    subject: 'Return & Refund',
    message: 'Size of the bracelet did not fit properly, can I exchange for smaller size?',
    status: 'Replied',
    replyText: 'Exchange initiated. Pickup will be completed tomorrow by Delhivery.',
    repliedAt: new Date('2026-11-07T14:30:00+05:30'),
    createdAt: new Date('2026-11-07T12:45:00+05:30'),
  },
  {
    name: 'Alok Mishra',
    email: 'alok.mishra@gmail.com',
    phone: '+91 94150 22110',
    subject: 'Card Customization',
    message: 'Inquiring about Gold-foiled special edition physical card decks.',
    status: 'Pending',
    createdAt: new Date('2026-11-06T16:50:00+05:30'),
  },
  {
    name: 'Divya Iyer',
    email: 'divya.iyer@gmail.com',
    phone: '+91 98400 66778',
    subject: 'Other Query',
    message: 'Thank you for this wonderful platform. The artwork and readings are exquisite.',
    status: 'Replied',
    replyText: 'We are delighted to hear that Divya. Thank you for being part of the Parrot Cards family.',
    repliedAt: new Date('2026-11-06T11:00:00+05:30'),
    createdAt: new Date('2026-11-06T09:30:00+05:30'),
  },
];

export class ContactMessageController {
  // Ensure seed data exists
  private async ensureSeedData() {
    try {
      const count = await ContactMessage.countDocuments();
      if (count === 0) {
        await ContactMessage.insertMany(INITIAL_MESSAGES);
      }
    } catch (err) {
      console.warn('Contact messages seed check:', err);
    }
  }

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

  // Admin: Get all messages with filtering, searching, stats and pagination
  public getMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.ensureSeedData();

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

      // Overall stats
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
