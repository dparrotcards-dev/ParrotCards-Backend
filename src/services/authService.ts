import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';
import { RegisterInput, LoginInput } from '../validators/authValidators';
import { ENV } from '../config/env';
import { IAuthUser } from '../types';

export class AuthService {
  private readonly SALT_ROUNDS = 10;
  private readonly TOKEN_EXPIRY = '30d';

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
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    };
  }
}
