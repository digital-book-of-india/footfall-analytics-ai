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

export interface FootfallSummary {
  shopId: string;
  date: string;
  entries: number;
  exits: number;
  estimatedOccupancy: number;
  dataSource: DataSource;
  quality: Quality;
}
