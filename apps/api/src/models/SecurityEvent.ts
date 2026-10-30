import mongoose, { Schema, Document, Types } from 'mongoose';
import { SecurityEvent, SecurityEventType, ReviewStatus } from '@dbi/shared-types';

export interface ISecurityEventDocument extends Document {
  eventId: string;
  seq: number;
  shopId: Types.ObjectId;
  cameraId: Types.ObjectId;
  eventType: SecurityEventType;
  confidence: number;
  startedAt: Date;
  endedAt?: Date;
  evidence: {
    snapshotObjectKey?: string;
    clipObjectKey?: string;
  };
  region?: { x: number; y: number; w: number; h: number };
  reviewStatus: ReviewStatus;
  modelVersion?: string;
  createdAt: Date;
  updatedAt: Date;
  toResponseObject(): SecurityEvent;
}

/**
 * A zone-watch alert raised by the AI worker (person lingering in / interacting with an
 * owner-drawn Zone — see models/Zone.ts) — distinct from FootfallEvent, which is a plain
 * entry/exit line-crossing count. `evidence` stores object keys only; the owner app reads the
 * picture through a short-lived signed URL (see services/evidence/signer.ts), never this
 * document directly.
 */
const SecurityEventSchema = new Schema<ISecurityEventDocument>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    seq: { type: Number },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    cameraId: { type: Schema.Types.ObjectId, ref: 'Camera', required: true, index: true },
    eventType: {
      type: String,
      enum: ['PERSON_IN_ZONE', 'POSSIBLE_SHUTTER_INTERACTION', 'POSSIBLE_TAMPERING', 'CAMERA_OFFLINE', 'AI_OFFLINE'],
      required: true,
    },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    startedAt: { type: Date, required: true, index: true },
    endedAt: { type: Date },
    evidence: {
      snapshotObjectKey: { type: String },
      clipObjectKey: { type: String },
    },
    region: {
      x: { type: Number },
      y: { type: Number },
      w: { type: Number },
      h: { type: Number },
    },
    reviewStatus: { type: String, enum: ['NEW', 'REVIEWED', 'FALSE_ALARM', 'CONFIRMED'], default: 'NEW', index: true },
    modelVersion: { type: String },
  },
  { timestamps: true }
);

SecurityEventSchema.index({ shopId: 1, startedAt: -1 });

// Per-shop sequential alert number (#1, #2, ...), assigned once on first save.
SecurityEventSchema.pre('save', async function (next) {
  if (this.isNew && this.seq === undefined) {
    const last = await SecurityEventModel.findOne({ shopId: this.shopId }).sort({ seq: -1 }).select('seq').lean();
    this.seq = ((last as any)?.seq || 0) + 1;
  }
  next();
});

SecurityEventSchema.methods.toResponseObject = function (): SecurityEvent {
  return {
    id: this._id.toString(),
    eventId: this.eventId,
    seq: this.seq,
    shopId: this.shopId.toString(),
    cameraId: this.cameraId.toString(),
    eventType: this.eventType,
    confidence: this.confidence,
    startedAt: this.startedAt.toISOString(),
    endedAt: this.endedAt ? this.endedAt.toISOString() : undefined,
    evidence: {
      snapshotObjectKey: this.evidence?.snapshotObjectKey,
      clipObjectKey: this.evidence?.clipObjectKey,
    },
    reviewStatus: this.reviewStatus,
    modelVersion: this.modelVersion,
    createdAt: this.createdAt.toISOString(),
  };
};

export const SecurityEventModel = mongoose.model<ISecurityEventDocument>('SecurityEvent', SecurityEventSchema);
