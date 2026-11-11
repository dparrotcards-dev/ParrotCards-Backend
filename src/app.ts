import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { ENV } from './config/env';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';
import { connectDB } from './config/database';
import { seedCardDefinitions } from './utils/seedCards';
import { seedAdminUser } from './utils/seedAdmin';

export const app = express();

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configuration with credentials support
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps or curl) or matching frontend / Vercel deployments
    if (
      !origin ||
      origin === ENV.FRONTEND_URL ||
      origin.endsWith('.vercel.app') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive fallback
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Guest-Session-Id', 'X-Razorpay-Signature'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Logging
if (ENV.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Request parsers with raw body capturing for webhooks
app.use(
  express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    },
    limit: '10mb',
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health & Info endpoints (immediate 200 OK without waiting for DB)
app.get(['/', '/api', '/api/health'], (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    name: 'Parrot Cards Vedic Astrological Engine',
    tagline: 'Draw the deck your birth sky dealt you.',
    version: '1.0.0',
    documentation: '/api/v1/health',
  });
});

// Auto-connect to database in serverless environments (Vercel)
let isConnected = false;
let isSeeded = false;

app.use(async (req: Request, res: Response, next) => {
  if (!isConnected) {
    try {
      await connectDB();
      isConnected = true;
    } catch (dbErr: any) {
      console.error('MongoDB serverless connection error:', dbErr);
      return res.status(500).json({
        success: false,
        message: 'Database connection failed. Please ensure MONGODB_URI is set in Vercel Environment Variables.',
        error: ENV.NODE_ENV === 'production' ? undefined : dbErr?.message,
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

  next();
});

// Rate limiting on all API routes
app.use('/api', apiRateLimiter);

// REST API V1 routes
app.use('/api/v1', apiRoutes);

// Centralized error handling middleware
app.use(errorHandler);

// Default export for Vercel Serverless Function & Express
export default app;

// CommonJS compatibility for Vercel runtime
if (typeof module !== 'undefined' && module.exports) {
  module.exports = app;
  module.exports.default = app;
  module.exports.app = app;
}
