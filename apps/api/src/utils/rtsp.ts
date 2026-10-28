/**
 * RTSP URL building. Username and password go through encodeURIComponent: a password with
 * '@', '#', ':' or '/' would otherwise be read as part of the host/path and break the URL.
 */

/** Generic IP cameras answer on this when no path is given. Recorders (Hikvision/Dahua) need
 *  the real channel path - leave the path empty there and use "Find channels". */
export const DEFAULT_RTSP_PATH = '/stream1';
export const DEFAULT_RTSP_PORT = 554;

export interface RtspParts {
  host: string;
  port?: number | string;
  username?: string;
  password?: string;
  path?: string;
}

export function buildRtspUrl(parts: RtspParts): string {
  const host = (parts.host || '').trim();
  if (!host || /[\s/@?#]/.test(host)) {
    throw new Error('A valid camera host/IP is required');
  }

  const port = parts.port === undefined || parts.port === '' ? DEFAULT_RTSP_PORT : Number(parts.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Port must be a number between 1 and 65535');
  }

  let path = (parts.path || '').trim() || DEFAULT_RTSP_PATH;
  if (!path.startsWith('/')) path = `/${path}`;

  let auth = '';
  if (parts.username) {
    auth = encodeURIComponent(parts.username);
    if (parts.password) auth += `:${encodeURIComponent(parts.password)}`;
    auth += '@';
  }

  // IPv6 literals need brackets in a URL authority.
  const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `rtsp://${auth}${hostPart}:${port}${path}`;
}
