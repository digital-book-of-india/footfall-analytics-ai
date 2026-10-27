import type {
  Role,
  CameraStatus,
  ConnectionType,
  ConnectorStatus,
  Direction,
  DataSource,
  Quality,
  ApiResponse,
  ApiError,
  User,
  AuthResponse,
  Shop,
  Camera,
  Connector,
  ConnectorWithPairingCode,
  NormalizedCoordinates,
  CountingLine,
  CameraTestResult,
  FootfallSummary,
  FootfallTimeseriesPoint
} from '@dbi/shared-types';

export type {
  Role,
  CameraStatus,
  ConnectionType,
  ConnectorStatus,
  Direction,
  DataSource,
  Quality,
  ApiResponse,
  ApiError,
  User,
  AuthResponse,
  Shop,
  Camera,
  Connector,
  ConnectorWithPairingCode,
  NormalizedCoordinates,
  CountingLine,
  CameraTestResult,
  FootfallSummary,
  FootfallTimeseriesPoint
};

export interface CreateShopInput {
  name: string;
  timezone: string;
  occupancyBaseline?: number;
}

export interface UpdateShopInput {
  name?: string;
  timezone?: string;
  occupancyBaseline?: number;
}

export interface CreateCameraInput {
  name: string;
  connectionType: ConnectionType;
  rtspUrl?: string;
  username?: string;
  password?: string;
  connectorId?: string | null;
}

export interface CreateConnectorInput {
  name: string;
}

export interface UpdateCountingLineInput {
  coordinates: NormalizedCoordinates;
  inDirection: Direction;
  outDirection: Direction;
  enabled: boolean;
}

export interface ResetOccupancyInput {
  newOccupancy: number;
  reason?: string;
}

// --- Find Channels / WebRTC Live View / Light Streams ---

export interface DiscoveredChannel {
  path: string;
  label: string;
  thumbnail?: string | null;
  alreadyAdded?: boolean;
}

export interface ChannelScanResult {
  status: 'PENDING' | 'DONE';
  channels?: DiscoveredChannel[];
  error?: string | null;
  debug?: string | null;
}

export interface IceServersResult {
  iceServers: RTCIceServer[];
  turn: boolean;
}

export interface UseSubstreamsResult {
  total: number;
  changed: number;
  skipped: number;
}

export interface LiveFrameResult {
  blob: Blob;
  at: string | null;
}
