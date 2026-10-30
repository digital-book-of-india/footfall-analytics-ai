/**
 * Essential Shared Roles for Authentication and RBAC
 */
export type Role = 'SHOP_OWNER' | 'SUPER_ADMIN' | 'AI_SERVICE';

/**
 * Camera operational and health statuses
 */
export type CameraStatus = 
  | 'NEEDS_SETUP' 
  | 'CONNECTING' 
  | 'ONLINE' 
  | 'DEGRADED' 
  | 'OFFLINE' 
  | 'CONFIG_ERROR';

/**
 * Footfall crossing direction relative to counting-line
 */
export type Direction = 'IN' | 'OUT';

/**
 * Source of the footfall data (LIVE stream or DEMO test clip)
 */
export type DataSource = 'LIVE' | 'DEMO';

/**
 * Footfall calculation quality indicator
 */
export type Quality = 'OK' | 'DEGRADED' | 'INCOMPLETE' | 'RESET_REQUIRED';

/**
 * Shop lifecycle statuses
 */
export type ShopStatus = 'ACTIVE' | 'SUSPENDED';

/**
 * User account status
 */
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

/**
 * Camera video connection type
 */
export type ConnectionType = 'RTSP' | 'TEST_CLIP' | 'HTTP_STREAM' | 'MOCK_STREAM' | 'WEBCAM';

/**
 * Lifecycle status of a paired on-site Connector agent (desktop app bridging a
 * shop's LAN cameras to the cloud API when they are not directly reachable).
 */
export type ConnectorStatus = 'PENDING' | 'PAIRED' | 'REVOKED';

/**
 * Time bucket granularity for footfall aggregates
 */
export type BucketType = 'HOUR' | 'DAY';

/**
 * Security Zone area type (what the owner-drawn polygon watches)
 */
export type ZoneType = 'SHUTTER' | 'GATE' | 'ENTRANCE' | 'CUSTOM';

/**
 * Security Zone alert sensitivity (surfaced in the UI; not yet read by detection logic)
 */
export type ZoneSensitivity = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Security event (zone-watch alert) type
 */
export type SecurityEventType =
  | 'PERSON_IN_ZONE'
  | 'POSSIBLE_SHUTTER_INTERACTION'
  | 'POSSIBLE_TAMPERING'
  | 'CAMERA_OFFLINE'
  | 'AI_OFFLINE';

/**
 * Owner's review verdict on a security event
 */
export type ReviewStatus = 'NEW' | 'REVIEWED' | 'FALSE_ALARM' | 'CONFIRMED';

/**
 * Standard API Error Codes
 */
export type ErrorCode = 
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'TENANT_VIOLATION'
  | 'CAMERA_OFFLINE'
  | 'INVALID_COORDINATES'
  | 'DUPLICATE_EVENT'
  | 'SERVICE_UNAVAILABLE'
  | 'RATE_LIMITED';
