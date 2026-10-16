export type TabKey = 'overview' | 'shops' | 'owners' | 'cameras' | 'audit' | 'audit-logs';

export interface OverviewMetrics {
  totalShops: number;
  activeShops: number;
  suspendedShops: number;
  totalCameras: number;
  onlineCameras: number;
  degradedCameras: number;
  offlineCameras: number;
  workerHealth: {
    status: 'ONLINE' | 'OFFLINE' | 'NEEDS_SETUP';
    lastHeartbeatAt: string | null;
  };
}

export interface ShopItem {
  _id: string;
  id?: string;
  name: string;
  ownerName?: string;
  ownerEmail?: string;
  owner?: { id?: string; name?: string; email?: string };
  cameraCount: number;
  timezone: string;
  status: 'ACTIVE' | 'SUSPENDED';
}

export interface OwnerItem {
  _id: string;
  id?: string;
  name: string;
  email: string;
  status: string;
  shopsCount: number;
  shopCount?: number;
  createdAt: string;
}

export interface CameraHealthItem {
  id: string;
  name: string;
  shopName: string;
  connectionType: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'NEEDS_SETUP';
  safeErrorCode: string | null;
  lastHeartbeatAt: string | null;
}

export interface AuditLogItem {
  id: string;
  createdAt: string;
  requestId: string;
  actorEmail: string;
  action: string;
  reason: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
