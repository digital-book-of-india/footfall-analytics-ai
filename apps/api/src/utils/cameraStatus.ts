/**
 * Effective camera status: never show "Online" for a camera that has stopped reporting.
 *
 * The stored status is only the LAST thing a worker said. If the worker (or the on-site
 * Connector it runs inside) is closed, nothing ever flips it, so the UI would stay green
 * forever. Any status that claims the camera is up is therefore downgraded to OFFLINE once
 * its last report is older than the stale window.
 */

/** Cameras reached through a Connector report via the Connector's worker; allow a bit more slack. */
export const CONNECTOR_CAMERA_STALE_MS = 120 * 1000;
export const CLOUD_CAMERA_STALE_MS = 90 * 1000;

export const NOT_REPORTING_CODE = 'NOT_REPORTING';

// Statuses that assert "the stream is up" and so must be backed by a recent report.
const CLAIMS_UP = new Set(['ONLINE', 'DEGRADED']);

// These have no live worker behind them by design (pure UI demo) - never stale.
const NEVER_STALE_TYPES = new Set(['MOCK_STREAM']);

export interface StatusInput {
  status: string;
  lastHeartbeatAt?: Date | string | null;
  connectorId?: unknown;
  connectionType?: string;
  safeErrorCode?: string;
}

export interface EffectiveStatus {
  status: string;
  safeErrorCode?: string;
}

export function effectiveCameraStatus(cam: StatusInput, now: number = Date.now()): EffectiveStatus {
  if (NEVER_STALE_TYPES.has(cam.connectionType || '') || !CLAIMS_UP.has(cam.status)) {
    return { status: cam.status, safeErrorCode: cam.safeErrorCode };
  }

  const staleMs = cam.connectorId ? CONNECTOR_CAMERA_STALE_MS : CLOUD_CAMERA_STALE_MS;
  const lastMs = cam.lastHeartbeatAt ? new Date(cam.lastHeartbeatAt).getTime() : NaN;

  if (Number.isNaN(lastMs) || now - lastMs > staleMs) {
    return { status: 'OFFLINE', safeErrorCode: NOT_REPORTING_CODE };
  }
  return { status: cam.status, safeErrorCode: cam.safeErrorCode };
}
