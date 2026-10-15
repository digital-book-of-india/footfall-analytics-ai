export type Role = 'SHOP_OWNER' | 'SUPER_ADMIN' | 'AI_SERVICE';

export type CameraStatus = 
  | 'NEEDS_SETUP' 
  | 'CONNECTING' 
  | 'ONLINE' 
  | 'DEGRADED' 
  | 'OFFLINE' 
  | 'CONFIG_ERROR';

export type Direction = 'IN' | 'OUT';
export type DataSource = 'LIVE' | 'DEMO';
export type Quality = 'OK' | 'DEGRADED' | 'INCOMPLETE' | 'RESET_REQUIRED';

export interface ApiResponse<T> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface Shop {
  id: string;
  ownerUserId: string;
  name: string;
  timezone: string;
  status: 'ACTIVE' | 'SUSPENDED';
  occupancyBaseline: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Camera {
  id: string;
  shopId: string;
  name: string;
  connectionType: 'RTSP' | 'WEBCAM' | 'MOCK_STREAM';
  status: CameraStatus;
  lastHeartbeatAt?: string | null;
  safeErrorCode?: string | null;
  rtspUrlMasked?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NormalizedCoordinates {
  x1: number; // 0..1
  y1: number; // 0..1
  x2: number; // 0..1
  y2: number; // 0..1
}

export interface CountingLine {
  id?: string;
  shopId: string;
  cameraId: string;
  coordinates: NormalizedCoordinates;
  inDirection: Direction;
  outDirection: Direction;
  enabled: boolean;
  updatedAt?: string;
}

export interface CameraTestResult {
  cameraId: string;
  status: CameraStatus;
  isReachable: boolean;
  safeErrorCode?: string | null;
  message: string;
  testedAt: string;
}

export interface FootfallSummary {
  shopId: string;
  date: string;
  entries: number;
  exits: number;
  estimatedOccupancy: number;
  occupancyBaseline?: number;
  dataSource: DataSource;
  quality: Quality;
}

export interface FootfallTimeseriesPoint {
  bucketStartUtc: string;
  bucketType?: 'HOUR' | 'DAY';
  entries: number;
  exits: number;
  estimatedOccupancy?: number;
}

