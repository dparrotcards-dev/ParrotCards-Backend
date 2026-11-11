import type { VercelRequest, VercelResponse } from '@vercel/node';
import { app } from '../src/app';
import { connectDB } from '../src/config/database';
import { seedCardDefinitions } from '../src/utils/seedCards';
import { seedAdminUser } from '../src/utils/seedAdmin';

let isConnected = false;
let isSeeded = false;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isConnected) {
    try {
      await connectDB();
      isConnected = true;
    } catch (dbErr: any) {
      console.error('MongoDB serverless connection error:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed. Ensure MONGODB_URI is set in Vercel.',
        error: process.env.NODE_ENV === 'production' ? undefined : dbErr?.message,
      });
    }
  }

  if (!isSeeded) {
    try {
      await seedCardDefinitions();
      await seedAdminUser();
    } catch (seedErr) {
      console.warn('Serverless seeding warning:', seedErr);
    }
    isSeeded = true;
  }

  return app(req, res);
}

