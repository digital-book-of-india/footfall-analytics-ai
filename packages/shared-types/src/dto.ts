import {
  Role,
  CameraStatus,
  Direction,
  DataSource,
  Quality,
  ShopStatus,
  ConnectionType,
  ZoneType,
  ZoneSensitivity,
  SecurityEventType,
  ReviewStatus
} from './enums.js';
import {
  User,
  Shop,
  Camera,
  CountingLine,
  NormalizedCoordinates,
  AuditLog,
  Point,
  SecurityEventEvidence
} from './models.js';

// ==========================================
// 1. Authentication DTOs
// ==========================================
export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role?: 'SHOP_OWNER' | 'SUPER_ADMIN'; // Default SHOP_OWNER
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponseData {
  user: User;
  token: string;
}

// ==========================================
// 2. Shop DTOs
// ==========================================
export interface CreateShopRequest {
  name: string;
  timezone?: string; // Default: 'Asia/Kolkata' or 'UTC'
  occupancyBaseline?: number;
}

export interface UpdateShopRequest {
  name?: string;
  timezone?: string;
  occupancyBaseline?: number;
}

// ==========================================
// 3. Camera DTOs
// ==========================================
export interface CreateCameraRequest {
  name: string;
  connectionType: 'RTSP' | 'WEBCAM' | 'MOCK_STREAM' | ConnectionType;
  streamUrl: string; // e.g. rtsp://... or https://... or test_clip
  username?: string;
  password?: string;
}

export interface UpdateCameraRequest {
  name?: string;
  connectionType?: 'RTSP' | 'WEBCAM' | 'MOCK_STREAM' | ConnectionType;
  streamUrl?: string;
  username?: string;
  password?: string;
}

export interface CameraTestResponseData {
  cameraId: string;
  accessible?: boolean;
  isReachable?: boolean;
  status: CameraStatus;
  latencyMs?: number;
  safeErrorCode?: string | null;
  message: string;
  testedAt: string;
}

export interface CameraHealthResponseData {
  cameraId: string;
  status: CameraStatus;
  lastHeartbeatAt?: string;
  fps?: number;
  droppedFrames?: number;
  modelVersion?: string;
}

// ==========================================
// 3b. On-site Connector DTOs
// ==========================================
export interface CreateConnectorRequest {
  name: string;
}

/** Sent by the unpaired Connector exe, exchanging a one-time pairing code for a device token. */
export interface PairConnectorRequest {
  pairingCode: string;
}

export interface PairConnectorResponseData {
  connectorId: string;
  connectorToken: string;
  shopId: string;
  shopName: string;
}

/** Sent periodically by a paired Connector so the dashboard can show "online - seen just now". */
export interface ConnectorHeartbeatRequest {
  version: string;
  activeCameraCount?: number;
}

export interface ConnectorCameraListItem {
  cameraId: string;
  shopId: string;
  name: string;
  connectionType: ConnectionType;
  streamUrl: string;
}

// ==========================================
// 4. Virtual Counting Line DTOs
// ==========================================
export interface SetCountingLineRequest {
  coordinates: NormalizedCoordinates;
  inDirection: Direction | string;
  outDirection: Direction | string;
  enabled?: boolean;
}

// ==========================================
// 4b. Security Zone DTOs
// ==========================================
export interface SaveZoneRequest {
  zoneType: ZoneType;
  polygon: Point[];
  sensitivity: ZoneSensitivity;
  enabled: boolean;
}

// ==========================================
// 4c. Security Event (zone-watch alert) DTOs
// ==========================================
export interface IngestSecurityEventRequest {
  eventId: string;
  shopId: string;
  cameraId: string;
  eventType: SecurityEventType;
  confidence: number;
  startedAt?: string;
  evidence?: { snapshotObjectKey?: string; clipObjectKey?: string };
  region?: { x: number; y: number; w: number; h: number };
  modelVersion?: string;
}

export interface IngestSecurityEventResponseData {
  processed: number;
  ignoredDuplicates: number;
}

export interface ReviewEventRequest {
  reviewStatus: Exclude<ReviewStatus, 'NEW'>;
}

export interface PaginatedEventsResponseData {
  items: Array<{
    id: string;
    eventId: string;
    shopId: string;
    cameraId: string;
    eventType: SecurityEventType;
    confidence: number;
    startedAt: string;
    endedAt?: string;
    evidence: SecurityEventEvidence;
    reviewStatus: ReviewStatus;
    modelVersion?: string;
    createdAt?: string;
  }>;
  nextCursor: string | null;
  total: number;
}

// ==========================================
// 5. Footfall & Analytics DTOs
// ==========================================
export interface FootfallSummaryResponseData {
  shopId: string;
  date: string; // YYYY-MM-DD
  entries: number;
  exits: number;
  estimatedOccupancy: number;
  occupancyBaseline?: number;
  dataSource: DataSource;
  quality: Quality;
  lastCalculatedAt?: string;
}

export interface HourlyTrafficPoint {
  hour?: string; // "09:00", "10:00" etc.
  bucketStartUtc: string;
  bucketType?: 'HOUR' | 'DAY';
  entries: number;
  exits: number;
  net?: number;
  estimatedOccupancy?: number;
}

export interface FootfallTimeseriesResponseData {
  shopId: string;
  date: string;
  points: HourlyTrafficPoint[];
}

export interface SetOccupancyBaselineRequest {
  baseline: number;
  reason?: string;
}

// ==========================================
// 6. Internal AI Service DTOs
// ==========================================
export interface IngestFootfallEventRequest {
  eventId: string; // UUID for deduplication
  shopId: string;
  cameraId: string;
  direction: Direction;
  occurredAt: string; // ISO UTC
  confidence: number;
  modelVersion: string;
}

export interface IngestFootfallBatchRequest {
  events: IngestFootfallEventRequest[];
}

export interface IngestEventResponseData {
  processed: number;
  ignoredDuplicates: number;
}

export interface AIHeartbeatRequest {
  cameraId: string;
  shopId?: string;
  status: CameraStatus;
  fps?: number;
  droppedFrames?: number;
  modelVersion?: string;
  message?: string;
}

// ==========================================
// 7. Super Admin DTOs
// ==========================================
export interface AdminOverviewResponseData {
  totalShops: number;
  activeShops: number;
  suspendedShops: number;
  totalOwners: number;
  totalCameras: number;
  onlineCameras: number;
  totalEntriesToday: number;
  totalExitsToday: number;
  currentEstimatedOccupancy: number;
}

export interface AdminShopItem {
  id: string;
  name: string;
  status: ShopStatus;
  timezone: string;
  owner: {
    id: string;
    name: string;
    email: string;
  };
  cameraCount: number;
  todayEntries: number;
  todayExits: number;
  currentOccupancy: number;
  createdAt: string;
}

export interface UpdateShopStatusRequest {
  status: ShopStatus;
  reason: string;
}

export interface AdminCameraHealthItem {
  cameraId: string;
  cameraName: string;
  shopId: string;
  shopName: string;
  status: CameraStatus;
  connectionType: ConnectionType;
  lastHeartbeatAt?: string;
  safeErrorCode?: string;
}
