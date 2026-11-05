import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  adminId?: mongoose.Types.ObjectId;
  adminEmail: string;
  adminName?: string;
  action: string;
  targetType: 'USER' | 'DECK' | 'CARD' | 'PAYMENT' | 'SYSTEM' | 'AUTH' | 'SETTINGS';
  targetId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    adminEmail: { type: String, required: true, index: true },
    adminName: { type: String },
    action: { type: String, required: true, index: true },
    targetType: {
      type: String,
      enum: ['USER', 'DECK', 'CARD', 'PAYMENT', 'SYSTEM', 'AUTH', 'SETTINGS'],
      required: true,
      index: true,
    },
    targetId: { type: String },
    details: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    status: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS', index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
