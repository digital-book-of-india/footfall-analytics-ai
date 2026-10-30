import mongoose, { Schema, Document, Types } from 'mongoose';
import { Zone, ZoneType, ZoneSensitivity, Point } from '@dbi/shared-types';

export interface IZoneDocument extends Document {
  shopId: Types.ObjectId;
  cameraId: Types.ObjectId;
  zoneType: ZoneType;
  polygon: Point[];
  sensitivity: ZoneSensitivity;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  toResponseObject(): Zone;
}

const PointSchema = new Schema<Point>(
  {
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

// One zone per camera (upsert on save, see PUT /cameras/:cameraId/zones) — watched by the AI
// worker independently of the entry/exit counting line (see models/CountingLine.ts). Points are
// normalized 0..1 of the video frame, matching CountingLine's coordinate convention.
const ZoneSchema = new Schema<IZoneDocument>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    cameraId: { type: Schema.Types.ObjectId, ref: 'Camera', required: true, unique: true, index: true },
    zoneType: { type: String, enum: ['SHUTTER', 'GATE', 'ENTRANCE', 'CUSTOM'], default: 'SHUTTER' },
    polygon: { type: [PointSchema], required: true, validate: (p: Point[]) => p.length >= 3 },
    sensitivity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ZoneSchema.methods.toResponseObject = function (): Zone {
  return {
    id: this._id.toString(),
    shopId: this.shopId.toString(),
    cameraId: this.cameraId.toString(),
    zoneType: this.zoneType,
    polygon: this.polygon.map((p: Point) => ({ x: p.x, y: p.y })),
    sensitivity: this.sensitivity,
    enabled: this.enabled,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const ZoneModel = mongoose.model<IZoneDocument>('Zone', ZoneSchema);
