import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { RegisterInput, LoginInput } from '../validators/authValidators';
import { ENV } from '../config/env';
import { IAuthUser } from '../types';
import { emailService } from './emailService';
import { ADMIN_ROLES } from '../middleware/authMiddleware';

export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly TOKEN_EXPIRY = '365d';

  public async register(input: RegisterInput): Promise<{ user: IAuthUser; token: string }> {
    const existing = await User.findOne({ email: input.email.toLowerCase() });
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(input.password, this.SALT_ROUNDS);
    const user = await User.create({
      email: input.email.toLowerCase(),
      name: input.name.trim(),
      passwordHash,
      role: 'user',
    });

    const authUser: IAuthUser = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = this.generateToken(authUser);
    return { user: authUser, token };
  }

  public async login(input: LoginInput): Promise<{ user: IAuthUser; token: string }> {
    const user = await User.findOne({ email: input.email.toLowerCase() });
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password.');
    }

    const authUser: IAuthUser = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = this.generateToken(authUser);
    return { user: authUser, token };
  }

  public async forgotPassword(
    email: string,
    accountType: 'customer' | 'admin' = 'customer'
  ): Promise<{ success: boolean; message: string; devLink?: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    // Query user strictly by requested accountType
    const query: any = { email: normalizedEmail };
    if (accountType === 'admin') {
      query.role = { $in: ADMIN_ROLES };
    } else {
      query.role = 'user';
    }

    const user = await User.findOne(query);

    // For privacy / security, if user does not exist with this role, return generic friendly message
    if (!user) {
      return {
        success: true,
        message:
          accountType === 'admin'
            ? 'If an administrator account exists with this email, a password reset link has been dispatched.'
            : 'If an account exists with this email, a password reset link has been dispatched.',
      };
    }

    // Generate unhashed random 32-byte hex token
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Hash token with SHA-256 for secure storage
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Set token & 1-hour expiration (3,600,000 ms)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000);
    await user.save();

    // Dispatch email
    const emailRes = await emailService.sendPasswordResetEmail(user.email, user.name, rawToken, accountType);

    return {
      success: true,
      message: 'A password reset link has been dispatched to your email address.',
      devLink: emailRes.devLink,
    };
  }

  public async verifyResetToken(
    token: string,
    expectedAccountType?: 'customer' | 'admin'
  ): Promise<{ valid: boolean; accountType?: 'customer' | 'admin'; message?: string }> {
    if (!token || typeof token !== 'string') {
      return { valid: false, message: 'Reset token is required.' };
    }

    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      return {
        valid: false,
        message: 'Invalid or expired password reset link. Please request a new one.',
      };
    }

    const actualAccountType: 'customer' | 'admin' = ADMIN_ROLES.includes(user.role) ? 'admin' : 'customer';

    if (expectedAccountType && expectedAccountType !== actualAccountType) {
      if (expectedAccountType === 'admin') {
        return {
          valid: false,
          accountType: actualAccountType,
          message: 'This reset token belongs to a customer account and cannot be used on the administrator portal.',
        };
      } else {
        return {
          valid: false,
          accountType: actualAccountType,
          message: 'This reset token belongs to an administrator account. Please use the administrator reset page.',
        };
      }
    }

    return {
      valid: true,
      accountType: actualAccountType,
    };
  }

  public async resetPassword(
    token: string,
    newPassword: string,
    accountType?: 'customer' | 'admin'
  ): Promise<{ success: boolean; message: string; accountType?: string }> {
    if (!token || typeof token !== 'string') {
      throw new Error('Reset token is required.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }

    // Hash the incoming raw token to compare against database
    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
      throw new Error('Invalid or expired password reset link. Please request a new one.');
    }

    const actualAccountType: 'customer' | 'admin' = ADMIN_ROLES.includes(user.role) ? 'admin' : 'customer';

    // Validate token against expected account type
    if (accountType && accountType !== actualAccountType) {
      if (accountType === 'admin') {
        throw new Error('This password reset token belongs to a customer account and cannot be used for administrative accounts.');
      } else {
        throw new Error('This password reset token belongs to an administrator account and cannot be used on the customer portal.');
      }
    }

    // Hash new password and clear reset tokens
    user.passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return {
      success: true,
      message: 'Your password has been reset successfully. You can now log in with your new password.',
      accountType: actualAccountType,
    };
  }

  public generateToken(user: IAuthUser): string {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ENV.JWT_SECRET,
      { expiresIn: this.TOKEN_EXPIRY }
    );
  }

  public getCookieOptions() {
    const isProd = ENV.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days persistent
      path: '/',
    };
  }
}
