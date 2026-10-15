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
export type ConnectionType = 'RTSP' | 'TEST_CLIP' | 'HTTP_STREAM';

/**
 * Time bucket granularity for footfall aggregates
 */
export type BucketType = 'HOUR' | 'DAY';

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
