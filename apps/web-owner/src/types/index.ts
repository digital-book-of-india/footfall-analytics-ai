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
