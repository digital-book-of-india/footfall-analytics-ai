import mongoose, { Schema, Document, Types } from 'mongoose';
import { CountingLine, NormalizedCoordinates } from '@dbi/shared-types';

export interface ICountingLineDocument extends Document {
  shopId: Types.ObjectId;
  cameraId: Types.ObjectId;
  coordinates: NormalizedCoordinates;
  inDirection: string;
  outDirection: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  toResponseObject(): CountingLine;
}

const CountingLineSchema = new Schema<ICountingLineDocument>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    cameraId: { type: Schema.Types.ObjectId, ref: 'Camera', required: true, unique: true, index: true },
    coordinates: {
      x1: { type: Number, required: true, min: 0, max: 1 },
      y1: { type: Number, required: true, min: 0, max: 1 },
      x2: { type: Number, required: true, min: 0, max: 1 },
      y2: { type: Number, required: true, min: 0, max: 1 },
    },
    inDirection: { type: String, required: true, default: 'TOP_TO_BOTTOM' },
    outDirection: { type: String, required: true, default: 'BOTTOM_TO_TOP' },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CountingLineSchema.methods.toResponseObject = function (): CountingLine {
  return {
    id: this._id.toString(),
    shopId: this.shopId.toString(),
    cameraId: this.cameraId.toString(),
    coordinates: this.coordinates,
    inDirection: this.inDirection,
    outDirection: this.outDirection,
    enabled: this.enabled,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const CountingLineModel = mongoose.model<ICountingLineDocument>('CountingLine', CountingLineSchema);
