import net from 'net';

/**
 * Real TCP reachability probe for an RTSP/HTTP stream host:port — ported from the
 * sibling theaft-ai project's camera test (apps/backend/src/modules/owner/cameras/routes.ts).
 * A genuine socket connect attempt, not a simulated/always-true result.
 */
export async function probeStreamReachability(
  streamUrl: string
): Promise<{ reachable: boolean; errorCode?: string }> {
  let host: string;
  let port: number;
  const isRtsp = streamUrl.startsWith('rtsp:');

  try {
    const parsed = new URL(streamUrl);
    host = parsed.hostname;
    port = Number(parsed.port) || (parsed.protocol === 'rtsp:' ? 554 : 80);
  } catch {
    // Real-world camera credentials are often not percent-encoded and can contain
    // characters (e.g. '#', '?') that make the strict WHATWG URL parser throw even
    // though host:port are perfectly extractable. Fall back to manual extraction
    // rather than wrongly reporting a reachable camera as a config error.
    const withoutScheme = streamUrl.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
    const afterAuth = withoutScheme.includes('@')
      ? withoutScheme.slice(withoutScheme.lastIndexOf('@') + 1)
      : withoutScheme;
    const hostPort = afterAuth.split(/[/?#]/)[0];
    const [h, p] = hostPort.split(':');
    host = h || '';
    port = Number(p) || (isRtsp ? 554 : 80);
  }

  if (!host) {
    return { reachable: false, errorCode: 'INVALID_STREAM_URL' };
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeoutMs = 4000;
    let settled = false;

    const finish = (result: { reachable: boolean; errorCode?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ reachable: true }));
    socket.once('timeout', () => finish({ reachable: false, errorCode: 'CONNECTION_TIMEOUT' }));
    socket.once('error', () => finish({ reachable: false, errorCode: 'CONNECTION_REFUSED' }));

    socket.connect(port, host);
  });
}
