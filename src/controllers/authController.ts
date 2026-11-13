import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { registerSchema, loginSchema } from '../validators/authValidators';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { User } from '../models/User';

const authService = new AuthService();

export class AuthController {
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = registerSchema.parse(req.body);
      const { user, token } = await authService.register(validated);

      res.cookie('token', token, authService.getCookieOptions());
      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: { user, token },
      });
    } catch (err) {
      next(err);
    }
  }

  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = loginSchema.parse(req.body);
      const { user, token } = await authService.login(validated);

      res.cookie('token', token, authService.getCookieOptions());
      res.json({
        success: true,
        message: 'Signed in successfully',
        data: { user, token },
      });
    } catch (err) {
      next(err);
    }
  }

  public async logout(req: Request, res: Response): Promise<void> {
    res.clearCookie('token', {
      httpOnly: true,
      path: '/',
    });
    res.json({
      success: true,
      message: 'Signed out successfully',
    });
  }

  public async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
        return;
      }

      const result = await authService.forgotPassword(email);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  public async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        res.status(400).json({ success: false, message: 'Token and new password are required.' });
        return;
      }

      const result = await authService.resetPassword(token, newPassword);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  public async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Not authenticated' });
        return;
      }

      const user = await User.findById(req.user.id).select('-passwordHash');
      if (!user) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }

      res.json({
        success: true,
        data: {
          user: {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            role: user.role,
            createdAt: user.createdAt,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
