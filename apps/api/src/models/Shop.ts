import mongoose, { Schema, Document, Types } from 'mongoose';
import { Shop, ShopStatus } from '@dbi/shared-types';

export interface IShopDocument extends Document {
  ownerUserId: Types.ObjectId;
  name: string;
  timezone: string;
  status: ShopStatus;
  occupancyBaseline: number;
  createdAt: Date;
  updatedAt: Date;
  toResponseObject(): Shop;
}

const ShopSchema = new Schema<IShopDocument>(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata', trim: true },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'SUSPENDED'], 
      default: 'ACTIVE',
      index: true 
    },
    occupancyBaseline: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ShopSchema.methods.toResponseObject = function (): Shop {
  return {
    id: this._id.toString(),
    ownerUserId: this.ownerUserId.toString(),
    name: this.name,
    timezone: this.timezone,
    status: this.status,
    occupancyBaseline: this.occupancyBaseline,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const ShopModel = mongoose.model<IShopDocument>('Shop', ShopSchema);
