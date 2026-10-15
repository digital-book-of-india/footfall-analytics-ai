import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { Role, UserStatus, SafeUser } from '@dbi/shared-types';

export interface IUserDocument extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
  toSafeObject(): SafeUser;
}

const UserSchema = new Schema<IUserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { 
      type: String, 
      enum: ['SHOP_OWNER', 'SUPER_ADMIN', 'AI_SERVICE'], 
      default: 'SHOP_OWNER' 
    },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'SUSPENDED'], 
      default: 'ACTIVE' 
    },
  },
  { timestamps: true }
);

// Method to verify candidate password
UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Method to serialize user safely without exposing password hash
UserSchema.methods.toSafeObject = function (): SafeUser {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const UserModel = mongoose.model<IUserDocument>('User', UserSchema);
