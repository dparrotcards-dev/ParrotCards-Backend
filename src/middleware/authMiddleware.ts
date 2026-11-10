import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env';
import { IAuthUser } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: IAuthUser;
  guestSessionId?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.cookies?.token;

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Authentication required. Please sign in or register to access this resource.',
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as IAuthUser;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired session token. Please log in again.',
    });
  }
}

export function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.cookies?.token;
  const guestHeader = req.headers['x-guest-session-id'] as string;

  if (guestHeader) {
    req.guestSessionId = guestHeader;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, ENV.JWT_SECRET) as IAuthUser;
      req.user = decoded;
    } catch {
      // Ignore token parse failure for optional auth
    }
  }

  next();
}

const ADMIN_ROLES = ['admin', 'superadmin', 'analytics_manager', 'content_manager', 'support_admin'];

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || !ADMIN_ROLES.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Access denied: Administrator privileges required.',
      });
      return;
    }
    next();
  });
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== 'superadmin') {
      res.status(403).json({
        success: false,
        message: 'Access denied: Super Administrator privileges required.',
      });
      return;
    }
    next();
  });
}
