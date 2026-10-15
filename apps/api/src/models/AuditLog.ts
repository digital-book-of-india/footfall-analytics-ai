import mongoose, { Schema, Document, Types } from 'mongoose';
import { AuditLog, Role } from '@dbi/shared-types';

export interface IAuditLogDocument extends Document {
  actor: {
    userId: Types.ObjectId;
    email: string;
    role: Role;
  };
  action: string;
  target: {
    type: 'SHOP' | 'CAMERA' | 'USER' | 'COUNTING_LINE' | 'SYSTEM';
    id: string;
  };
  reason?: string;
  requestId: string;
  createdAt: Date;
  toResponseObject(): AuditLog;
}

const AuditLogSchema = new Schema<IAuditLogDocument>(
  {
    actor: {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      email: { type: String, required: true },
      role: { type: String, required: true },
    },
    action: { type: String, required: true, index: true },
    target: {
      type: { type: String, required: true, enum: ['SHOP', 'CAMERA', 'USER', 'COUNTING_LINE', 'SYSTEM'] },
      id: { type: String, required: true },
    },
    reason: { type: String },
    requestId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.methods.toResponseObject = function (): AuditLog {
  return {
    id: this._id.toString(),
    actor: {
      userId: this.actor.userId.toString(),
      email: this.actor.email,
      role: this.actor.role,
    },
    action: this.action,
    target: this.target,
    reason: this.reason,
    requestId: this.requestId,
    createdAt: this.createdAt.toISOString(),
  };
};

export const AuditLogModel = mongoose.model<IAuditLogDocument>('AuditLog', AuditLogSchema);
