import mongoose, { Schema, Document, Types } from 'mongoose';
import { FootfallEvent, Direction } from '@dbi/shared-types';

export interface IFootfallEventDocument extends Document {
  eventId: string;
  shopId: Types.ObjectId;
  cameraId: Types.ObjectId;
  direction: Direction;
  occurredAt: Date;
  confidence: number;
  modelVersion: string;
  createdAt: Date;
  toResponseObject(): FootfallEvent;
}

const FootfallEventSchema = new Schema<IFootfallEventDocument>(
  {
    // Unique eventId is enforced by unique index for strict deduplication & idempotency
    eventId: { type: String, required: true, unique: true, index: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    cameraId: { type: Schema.Types.ObjectId, ref: 'Camera', required: true, index: true },
    direction: { type: String, enum: ['IN', 'OUT'], required: true, index: true },
    occurredAt: { type: Date, required: true, index: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    modelVersion: { type: String, required: true, default: 'yolo-crossing-v1.0' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound indexes for fast time-series queries
FootfallEventSchema.index({ shopId: 1, occurredAt: 1, direction: 1 });
FootfallEventSchema.index({ cameraId: 1, occurredAt: 1 });

FootfallEventSchema.methods.toResponseObject = function (): FootfallEvent {
  return {
    eventId: this.eventId,
    shopId: this.shopId.toString(),
    cameraId: this.cameraId.toString(),
    direction: this.direction,
    occurredAt: this.occurredAt.toISOString(),
    confidence: this.confidence,
    modelVersion: this.modelVersion,
  };
};

export const FootfallEventModel = mongoose.model<IFootfallEventDocument>('FootfallEvent', FootfallEventSchema);
