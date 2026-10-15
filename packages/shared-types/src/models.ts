import { 
  Role, 
  CameraStatus, 
  Direction, 
  Quality, 
  ShopStatus, 
  UserStatus, 
  ConnectionType, 
  BucketType 
} from './enums.js';

/**
 * 1. User Model
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Safe user representation (without sensitive fields)
 */
export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * 2. Shop Model
 */
export interface Shop {
  id: string;
  ownerUserId: string;
  name: string;
  timezone: string;
  status: ShopStatus;
  occupancyBaseline: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Normalized 2D coordinates on video frame [0.0 .. 1.0]
 */
export interface NormalizedCoordinates {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 3. Camera Model
 * NOTE: Raw passwords or credential-bearing RTSP URLs are strictly excluded
 * from public-facing models to satisfy secret handling requirements.
 */
export interface Camera {
  id: string;
  shopId: string;
  name: string;
  connectionType: 'RTSP' | 'WEBCAM' | 'MOCK_STREAM';
  status: CameraStatus;
  hasCredentials?: boolean;
  rtspUrlMasked?: string;
  lastHeartbeatAt?: string | null;
  safeErrorCode?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 4. Virtual Counting Line Model
 */
export interface CountingLine {
  id?: string;
  shopId: string;
  cameraId: string;
  coordinates: NormalizedCoordinates;
  inDirection: Direction;
  outDirection: Direction;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 5. Footfall Crossing Event Model (Raw Event)
 */
export interface FootfallEvent {
  eventId: string;
  shopId: string;
  cameraId: string;
  direction: Direction;
  occurredAt: string;
  confidence: number;
  modelVersion: string;
}

/**
 * 6. Footfall Aggregates (Hourly / Daily rollups)
 */
export interface FootfallAggregate {
  shopId: string;
  bucketStartUtc: string;
  bucketType: BucketType;
  entries: number;
  exits: number;
  quality: Quality;
}

/**
 * 7. Audit Log Model
 */
export interface AuditLog {
  id: string;
  actor: {
    userId: string;
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
  createdAt: string;
}
