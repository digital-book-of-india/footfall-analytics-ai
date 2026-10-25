import mongoose, { Schema, Document, Types } from 'mongoose';
import { Connector, ConnectorStatus } from '@dbi/shared-types';

export interface IConnectorDocument extends Document {
  shopId: Types.ObjectId;
  name: string;
  status: ConnectorStatus;
  pairingCode?: string | null;
  pairingCodeExpiresAt?: Date | null;
  tokenHash?: string | null;
  lastHeartbeatAt?: Date | null;
  lastSeenVersion?: string | null;
  activeCameraCount: number;
  createdAt: Date;
  updatedAt: Date;
  toResponseObject(): Connector;
}

const ConnectorSchema = new Schema<IConnectorDocument>(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true, index: true },
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'PAIRED', 'REVOKED'],
      default: 'PENDING',
      index: true,
    },
    pairingCode: { type: String, default: null, index: true },
    pairingCodeExpiresAt: { type: Date, default: null },
    tokenHash: { type: String, default: null, index: true },
    lastHeartbeatAt: { type: Date, default: null },
    lastSeenVersion: { type: String, default: null },
    activeCameraCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/** A paired connector counts as online only if it heartbeat within the stale window — never fake "online". */
const CONNECTOR_STALE_MS = 2 * 60 * 1000;

ConnectorSchema.methods.toResponseObject = function (): Connector {
  const online =
    this.status === 'PAIRED' &&
    Boolean(this.lastHeartbeatAt) &&
    Date.now() - new Date(this.lastHeartbeatAt).getTime() <= CONNECTOR_STALE_MS;

  return {
    id: this._id.toString(),
    shopId: this.shopId.toString(),
    name: this.name,
    status: this.status,
    online,
    lastHeartbeatAt: this.lastHeartbeatAt ? this.lastHeartbeatAt.toISOString() : null,
    lastSeenVersion: this.lastSeenVersion || null,
    activeCameraCount: this.activeCameraCount || 0,
    createdAt: this.createdAt.toISOString(),
  };
};

export const ConnectorModel =
  (mongoose.models.Connector as mongoose.Model<IConnectorDocument>) ||
  mongoose.model<IConnectorDocument>('Connector', ConnectorSchema);
