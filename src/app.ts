import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { ENV } from './config/env';
import apiRoutes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimiter';

export const app = express();

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS configuration with credentials support
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps or curl) or matching frontend
      if (!origin || origin === ENV.FRONTEND_URL || origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive in dev, or specify exact origin
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Guest-Session-Id', 'X-Razorpay-Signature'],
  })
);

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

// Rate limiting on all API routes
app.use('/api', apiRateLimiter);

// REST API V1 routes
app.use('/api/v1', apiRoutes);

// Health & Info endpoints
app.get(['/', '/api', '/api/health'], (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    name: 'Parrot Cards Vedic Astrological Engine',
    tagline: 'Draw the deck your birth sky dealt you.',
    version: '1.0.0',
    documentation: '/api/v1/health',
  });
});

// Centralized error handling middleware
app.use(errorHandler);
