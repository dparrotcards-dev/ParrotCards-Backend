import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'user' | 'admin' | 'superadmin' | 'analytics_manager' | 'content_manager' | 'support_admin';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ['user', 'admin', 'superadmin', 'analytics_manager', 'content_manager', 'support_admin'],
      default: 'user',
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
