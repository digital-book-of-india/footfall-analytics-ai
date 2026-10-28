// Pure probe / channel-scan logic. All I/O (TCP, RTSP DESCRIBE, thumbnails) is injected so
// this file has no electron dependency and can be unit-tested with fakes (see
// test/scan.test.js). probe.js wires in the real implementations.

const MAX_CHANNELS = 32;
const SCAN_CONCURRENCY = 2;
const THUMB_CONCURRENCY = 2;
const DETECT_CHANNELS = [1, 2, 3, 4];

const PATH_SCHEMES = {
  hikvision: {
    mainPath: (n) => `/Streaming/Channels/${n}01`,
    subPath: (n) => `/Streaming/Channels/${n}02`,
    matches: (path) => /^\/Streaming\/Channels\/\d+/i.test(path),
  },
  dahua: {
    mainPath: (n) => `/cam/realmonitor?channel=${n}&subtype=0`,
    subPath: (n) => `/cam/realmonitor?channel=${n}&subtype=1`,
    matches: (path) => /^\/cam\/realmonitor/i.test(path),
  },
};

/** Maps an RTSP DESCRIBE answer to the probe result the backend expects. */
function mapDescribeToProbeResult(res) {
  if (res.status === null || res.status === undefined) return { reachable: false, errorCode: "NO_RTSP_RESPONSE" };
  if (res.status === 401 || res.status === 403) return { reachable: false, errorCode: "AUTH_FAILED" };
  if (res.status === 404) return { reachable: false, errorCode: "STREAM_PATH_NOT_FOUND" };
  if (res.status === 200) return { reachable: true };
  return { reachable: false, errorCode: "NO_RTSP_RESPONSE" };
}

function fmt(res) {
  if (res.status === null || res.status === undefined) return `null(${res.error}${res.raw ? `: ${res.raw}` : ""})`;
  return String(res.status);
}

function buildUrl(streamUrl, newPath) {
  const u = new URL(streamUrl);
  // rebuild preserving scheme/credentials/host, replacing only pathname+search
  const idx = newPath.indexOf("?");
  u.pathname = idx >= 0 ? newPath.slice(0, idx) : newPath;
  u.search = idx >= 0 ? newPath.slice(idx) : "";
  return u.toString();
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

/**
 * deps: {
 *   tcpProbe(streamUrl)      -> { reachable, errorCode? }
 *   describe(streamUrl)      -> { status, hasVideo?, error?, raw? }   (rtsp.describe)
 *   grabThumbnail(streamUrl) -> data-URL string | null
 *   parsePath(streamUrl)     -> path string (rtsp.parseUrl(url).path)
 *   retryDelayMs?            -> pause before the single no-answer retry (default 800)
 * }
 */
function createScanner(deps) {
  const { tcpProbe, describe, grabThumbnail, parsePath } = deps;
  const retryDelayMs = deps.retryDelayMs ?? 800;

  // Recorders refuse a fraction of sessions when several arrive at once - retry a no-answer once.
  async function describeWithRetry(streamUrl) {
    let res = await describe(streamUrl);
    if (res.status === null || res.status === undefined) {
      if (retryDelayMs) await new Promise((r) => setTimeout(r, retryDelayMs));
      res = await describe(streamUrl);
    }
    return res;
  }

  async function probeCamera(streamUrl) {
    const tcp = await tcpProbe(streamUrl);
    if (!tcp.reachable) return tcp;
    return mapDescribeToProbeResult(await describeWithRetry(streamUrl));
  }

  async function detectScheme(streamUrl, debugParts) {
    for (const [schemeName, scheme] of Object.entries(PATH_SCHEMES)) {
      for (const n of DETECT_CHANNELS) {
        const res = await describeWithRetry(buildUrl(streamUrl, scheme.mainPath(n)));
        debugParts.push(fmt(res));
        if (res.status === 401 || res.status === 403) return { error: "AUTH_FAILED" };
        if (res.status === 200 && res.hasVideo) return { schemeName, scheme };
      }
    }
    return null;
  }

  async function discoverChannels(streamUrl) {
    const debugParts = [];
    const debug = () => debugParts.join(", ");

    const tcp = await tcpProbe(streamUrl);
    if (!tcp.reachable) return { channels: [], error: tcp.errorCode, debug: debug() };

    const ownRes = await describeWithRetry(streamUrl);
    debugParts.push(fmt(ownRes));
    if (ownRes.status === 401 || ownRes.status === 403) {
      return { channels: [], error: "AUTH_FAILED", debug: debug() };
    }

    let path;
    try {
      path = parsePath(streamUrl);
    } catch {
      path = "";
    }

    let matchedScheme = Object.values(PATH_SCHEMES).find((s) => s.matches(path)) || null;

    if (!matchedScheme) {
      const detected = await detectScheme(streamUrl, debugParts);
      if (detected && detected.error) return { channels: [], error: detected.error, debug: debug() };
      matchedScheme = detected ? detected.scheme : null;
    }

    if (!matchedScheme) {
      // A single IP camera (not a recorder) just returns itself.
      if (ownRes.status === 200 && ownRes.hasVideo) {
        const thumbnail = await grabThumbnail(streamUrl);
        return { channels: [{ channel: 1, label: "This camera", path, thumbnail }], debug: debug() };
      }
      return { channels: [], error: "NO_CHANNELS_FOUND", debug: debug() };
    }

    const channelNumbers = Array.from({ length: MAX_CHANNELS }, (_, i) => i + 1);
    const scanResults = await mapWithConcurrency(channelNumbers, SCAN_CONCURRENCY, async (n) => {
      const res = await describeWithRetry(buildUrl(streamUrl, matchedScheme.mainPath(n)));
      debugParts.push(fmt(res));
      // A channel counts only if DESCRIBE is 200 AND the SDP has a video track.
      return res.status === 200 && res.hasVideo ? { channel: n, mainPath: matchedScheme.mainPath(n) } : null;
    });

    const found = scanResults.filter(Boolean);
    if (!found.length) return { channels: [], error: "NO_CHANNELS_FOUND", debug: debug() };

    // Prefer each channel's SUB stream (lighter on the PC, H.264).
    const withSub = await mapWithConcurrency(found, SCAN_CONCURRENCY, async (ch) => {
      const subPath = matchedScheme.subPath(ch.channel);
      const subRes = await describeWithRetry(buildUrl(streamUrl, subPath));
      debugParts.push(fmt(subRes));
      const useSub = subRes.status === 200 && subRes.hasVideo;
      return { channel: ch.channel, path: useSub ? subPath : ch.mainPath };
    });

    const withThumbs = await mapWithConcurrency(withSub, THUMB_CONCURRENCY, async (ch) => {
      const thumbnail = await grabThumbnail(buildUrl(streamUrl, ch.path));
      return { channel: ch.channel, path: ch.path, label: `Channel ${ch.channel}`, thumbnail };
    });

    return { channels: withThumbs, debug: debug() };
  }

  return { probeCamera, discoverChannels, describeWithRetry };
}

module.exports = { createScanner, mapDescribeToProbeResult, buildUrl, PATH_SCHEMES, MAX_CHANNELS };
