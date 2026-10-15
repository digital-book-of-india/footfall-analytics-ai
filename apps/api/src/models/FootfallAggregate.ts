import mongoose, { Schema, Document, Types } from 'mongoose';
import { FootfallAggregate, BucketType, Quality } from '@dbi/shared-types';

export interface IFootfallAggregateDocument extends Document {
  shopId: Types.ObjectId;
  bucketStartUtc: Date;
  bucketType: BucketType;
  entries: number;
  exits: number;
  quality: Quality;
  createdAt: Date;
  updatedAt: Date;
  toResponseObject(): FootfallAggregate;
}

const FootfallAggregateSchema = new Schema<IFootfallAggregateDocument>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    bucketStartUtc: { type: Date, required: true, index: true },
    bucketType: { type: String, enum: ['HOUR', 'DAY'], default: 'HOUR', required: true },
    entries: { type: Number, default: 0, min: 0 },
    exits: { type: Number, default: 0, min: 0 },
    quality: { 
      type: String, 
      enum: ['OK', 'DEGRADED', 'INCOMPLETE', 'RESET_REQUIRED'], 
      default: 'OK' 
    },
  },
  { timestamps: true }
);

// Unique compound index so each bucket per shop is unique
FootfallAggregateSchema.index({ shopId: 1, bucketStartUtc: 1, bucketType: 1 }, { unique: true });

FootfallAggregateSchema.methods.toResponseObject = function (): FootfallAggregate {
  return {
    shopId: this.shopId.toString(),
    bucketStartUtc: this.bucketStartUtc.toISOString(),
    bucketType: this.bucketType,
    entries: this.entries,
    exits: this.exits,
    quality: this.quality,
  };
};

export const FootfallAggregateModel = mongoose.model<IFootfallAggregateDocument>(
  'FootfallAggregate',
  FootfallAggregateSchema
);
