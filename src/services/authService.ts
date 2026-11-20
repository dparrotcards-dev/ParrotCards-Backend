import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User, IUser } from '../models/User';
import { RegisterInput, LoginInput, GoogleLoginInput } from '../validators/authValidators';
import { ENV } from '../config/env';
import { IAuthUser } from '../types';
import { emailService } from './emailService';
import { ADMIN_ROLES } from '../middleware/authMiddleware';

const createAuthError = (message: string, statusCode: number) =>
  Object.assign(new Error(message), { statusCode });

export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly TOKEN_EXPIRY = '365d';
  private readonly googleClient = new OAuth2Client(ENV.GOOGLE_CLIENT_ID);

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

  public async loginWithGoogle(input: GoogleLoginInput): Promise<{ user: IAuthUser; token: string }> {
    if (!ENV.GOOGLE_CLIENT_ID) {
      throw createAuthError('Google sign-in is not configured on the server.', 503);
    }

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: input.idToken,
        audience: ENV.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw createAuthError('The Google sign-in credential is invalid or expired.', 401);
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      throw createAuthError('Google sign-in requires a verified email address.', 401);
    }

    const email = payload.email.trim().toLowerCase();
    let user = await User.findOne({ googleId: payload.sub });
    if (!user) {
      user = await User.findOne({ email });
    }

    if (user) {
      if (user.role !== 'user') {
        throw createAuthError('Google sign-in is available for customer accounts only.', 403);
      }

      if (user.googleId && user.googleId !== payload.sub) {
        throw createAuthError('This email is already linked to a different Google account.', 409);
      }

      if (!user.googleId) {
        user.googleId = payload.sub;
        await user.save();
      }
    } else {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), this.SALT_ROUNDS);
      try {
        user = await User.create({
          email,
          name: payload.name?.trim() || email.split('@')[0],
          googleId: payload.sub,
          passwordHash,
          role: 'user',
        });
      } catch (err) {
        if (!err || typeof err !== 'object' || !('code' in err) || err.code !== 11000) throw err;

        user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });
        if (!user) throw err;
        if (user.role !== 'user') {
          throw createAuthError('Google sign-in is available for customer accounts only.', 403);
        }
        if (user.googleId && user.googleId !== payload.sub) {
          throw createAuthError('This email is already linked to a different Google account.', 409);
        }
        if (!user.googleId) {
          user.googleId = payload.sub;
          await user.save();
        }
      }
    }

    const authUser: IAuthUser = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };

    return { user: authUser, token: this.generateToken(authUser) };
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
