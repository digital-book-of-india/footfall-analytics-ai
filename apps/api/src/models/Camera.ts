import mongoose, { Schema, Document, Types } from 'mongoose';
import { Camera, CameraStatus, ConnectionType } from '@dbi/shared-types';
import { effectiveCameraStatus } from '../utils/cameraStatus.js';

export interface ICameraDocument extends Document {
  shopId: Types.ObjectId;
  connectorId?: Types.ObjectId | null;
  name: string;
  connectionType: ConnectionType;
  encryptedStreamUrl: string;
  sanitizedStreamUrl: string;
  encryptedCredentials?: string;
  hasCredentials: boolean;
  status: CameraStatus;
  lastHeartbeatAt?: Date;
  safeErrorCode?: string;
  createdAt: Date;
  updatedAt: Date;
  toResponseObject(): Camera;
}

const CameraSchema = new Schema<ICameraDocument>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    connectorId: { type: Schema.Types.ObjectId, ref: 'Connector', default: null, index: true },
    name: { type: String, required: true, trim: true },
    connectionType: { 
      type: String, 
      enum: ['RTSP', 'TEST_CLIP', 'HTTP_STREAM', 'MOCK_STREAM', 'WEBCAM'], 
      default: 'RTSP' 
    },
    encryptedStreamUrl: { type: String, required: true },
    sanitizedStreamUrl: { type: String, required: true },
    encryptedCredentials: { type: String },
    hasCredentials: { type: Boolean, default: false },
    status: { 
      type: String, 
      enum: ['NEEDS_SETUP', 'CONNECTING', 'ONLINE', 'DEGRADED', 'OFFLINE', 'CONFIG_ERROR'], 
      default: 'CONNECTING',
      index: true 
    },
    lastHeartbeatAt: { type: Date },
    safeErrorCode: { type: String },
  },
  { timestamps: true }
);

/**
 * Serializes camera safely without ever exposing encrypted or raw credentials
 */
CameraSchema.methods.toResponseObject = function (): Camera {
  // Never report a stale "Online": a camera whose worker/connector went quiet is OFFLINE.
  const effective = effectiveCameraStatus(this as unknown as ICameraDocument);
  return {
    id: this._id.toString(),
    shopId: this.shopId.toString(),
    connectorId: this.connectorId ? this.connectorId.toString() : null,
    name: this.name,
    connectionType: this.connectionType,
    status: effective.status as CameraStatus,
    hasCredentials: this.hasCredentials,
    rtspUrlMasked: this.sanitizedStreamUrl || undefined,
    lastHeartbeatAt: this.lastHeartbeatAt ? this.lastHeartbeatAt.toISOString() : undefined,
    safeErrorCode: effective.safeErrorCode,
    createdAt: this.createdAt.toISOString(),
    updatedAt: this.updatedAt.toISOString(),
  };
};

export const CameraModel = mongoose.model<ICameraDocument>('Camera', CameraSchema);
