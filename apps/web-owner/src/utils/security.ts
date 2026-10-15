/**
 * Security utilities to ensure secrets and credential-bearing RTSP URLs
 * are NEVER displayed in UI, logged to console, or exported in plaintext.
 */

export function maskRtspUrl(url?: string | null): string {
  if (!url) return 'Not configured';
  try {
    // Match rtsp://[user[:pass]@]host[:port][/path]
    const rtspRegex = /^(rtsp(?:s)?:\/\/)(?:([^:]+)(?::([^@]+))?@)?([^/\s]+)(.*)?$/i;
    const match = url.match(rtspRegex);
    if (!match) {
      // If it's not a standard RTSP string, sanitize any potential password patterns
      return url.replace(/:([^@\s/]+)@/g, ':****@');
    }

    const scheme = match[1];
    const user = match[2];
    const pass = match[3];
    const host = match[4];
    const path = match[5] || '';

    if (user && pass) {
      return `${scheme}${user}:****@${host}${path}`;
    } else if (user) {
      return `${scheme}${user}@${host}${path}`;
    }
    return `${scheme}${host}${path}`;
  } catch {
    return 'rtsp://****:****@camera-stream';
  }
}

export function maskPassword(length = 8): string {
  return '•'.repeat(length);
}

export function safeLog(message: string, data?: unknown): void {
  // Strips passwords or secrets before logging
  if (process.env.NODE_ENV !== 'production') {
    if (typeof data === 'object' && data !== null) {
      const sanitized = JSON.parse(JSON.stringify(data, (key, value) => {
        if (/password|secret|token|credentials/i.test(key) && typeof value === 'string') {
          return '[REDACTED]';
        }
        if (/rtspUrl/i.test(key) && typeof value === 'string') {
          return maskRtspUrl(value);
        }
        return value;
      }));
      // eslint-disable-next-line no-console
      console.log(`[SafeLog] ${message}`, sanitized);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[SafeLog] ${message}`);
    }
  }
}
