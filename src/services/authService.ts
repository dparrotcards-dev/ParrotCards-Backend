import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { RegisterInput, LoginInput } from '../validators/authValidators';
import { ENV } from '../config/env';
import { IAuthUser } from '../types';
import { emailService } from './emailService';

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

  public async forgotPassword(email: string): Promise<{ success: boolean; message: string; devLink?: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // For privacy / security, if user does not exist, return generic friendly message
    if (!user) {
      return {
        success: true,
        message: 'If an account exists with this email, a password reset link has been dispatched.',
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
    await emailService.sendPasswordResetEmail(user.email, user.name, rawToken);

    return {
      success: true,
      message: 'A password reset link has been dispatched to your email address.',
    };
  }

  public async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
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

    // Hash new password and clear reset tokens
    user.passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return {
      success: true,
      message: 'Your password has been reset successfully. You can now log in with your new password.',
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
