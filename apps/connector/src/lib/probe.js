const net = require("net");
const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const path = require("path");
const { app } = require("electron");
const log = require("electron-log");
const rtsp = require("./rtsp");
const api = require("./api");
const { JOB_POLL_INTERVAL_MS } = require("./config");

const MAX_CHANNELS = 32;
const SCAN_CONCURRENCY = 2;
const THUMB_CONCURRENCY = 2;
const DETECT_CHANNELS = [1, 2, 3, 4];
const THUMB_TIMEOUT_MS = 15000;

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

function tcpProbe(streamUrl, timeout = 4000) {
  return new Promise((resolve) => {
    let host, port;
    try {
      const parsed = rtsp.parseUrl(streamUrl);
      host = parsed.host;
      port = parsed.port;
    } catch {
      resolve({ reachable: false, errorCode: "INVALID_STREAM_URL" });
      return;
    }

    const socket = net.connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once("connect", () => done({ reachable: true }));
    socket.once("timeout", () => done({ reachable: false, errorCode: "CONNECTION_TIMEOUT" }));
    socket.once("error", (err) => {
      const code = err.code === "ECONNREFUSED" ? "CONNECTION_REFUSED" : "CONNECTION_TIMEOUT";
      done({ reachable: false, errorCode: code });
    });
  });
}

function fmt(res) {
  if (res.status === null) return `null(${res.error}${res.raw ? `: ${res.raw}` : ""})`;
  return String(res.status);
}

async function describeWithRetry(streamUrl) {
  let res = await rtsp.describe(streamUrl);
  if (res.status === null) {
    await new Promise((r) => setTimeout(r, 800));
    res = await rtsp.describe(streamUrl);
  }
  return res;
}

async function probeCamera(streamUrl) {
  const tcp = await tcpProbe(streamUrl);
  if (!tcp.reachable) return tcp;

  const res = await describeWithRetry(streamUrl);
  if (res.status === null) return { reachable: false, errorCode: "NO_RTSP_RESPONSE" };
  if (res.status === 401 || res.status === 403) return { reachable: false, errorCode: "AUTH_FAILED" };
  if (res.status === 404) return { reachable: false, errorCode: "STREAM_PATH_NOT_FOUND" };
  return { reachable: true };
}

function runtimePythonPaths() {
  if (app.isPackaged) {
    return {
      pythonPath: path.join(process.resourcesPath, "python", "python.exe"),
      toolsDir: path.join(process.resourcesPath, "ai-worker", "src", "tools"),
    };
  }
  return {
    pythonPath: process.env.FOOTFALL_PYTHON || "python",
    toolsDir: path.join(__dirname, "..", "..", "..", "ai-worker", "src", "tools"),
  };
}

function grabThumbnail(streamUrl) {
  return new Promise((resolve) => {
    // A thumbnail is best-effort - any failure here (missing/locked embedded Python,
    // a bad path, a spawn error) must resolve(null), never throw/reject. A rejection
    // here would propagate out of discoverChannels() and discard every channel the
    // scan already found, not just the one missing a preview image.
    let pythonPath, toolsDir;
    try {
      ({ pythonPath, toolsDir } = runtimePythonPaths());
    } catch {
      resolve(null);
      return;
    }
    const scriptPath = path.join(toolsDir, "grab_frame.py");

    let child;
    try {
      child = spawn(pythonPath, [scriptPath, streamUrl]);
    } catch {
      resolve(null);
      return;
    }

    let stdout = "";
    const killTimer = setTimeout(() => {
      child.kill();
    }, THUMB_TIMEOUT_MS);

    child.stdout?.on("data", (buf) => {
      stdout += buf.toString();
    });
    child.on("close", () => {
      clearTimeout(killTimer);
      const lastLine = stdout.trim().split(/\r?\n/).pop() || "";
      try {
        const parsed = JSON.parse(lastLine);
        if (parsed && parsed.jpeg) {
          resolve(`data:image/jpeg;base64,${parsed.jpeg}`);
          return;
        }
      } catch {
        // fall through to null
      }
      resolve(null);
    });
    child.on("error", () => {
      clearTimeout(killTimer);
      resolve(null);
    });
  });
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

function buildUrl(streamUrl, newPath) {
  const u = new URL(streamUrl);
  // rebuild preserving scheme/credentials/host, replacing only pathname+search
  const idx = newPath.indexOf("?");
  u.pathname = idx >= 0 ? newPath.slice(0, idx) : newPath;
  u.search = idx >= 0 ? newPath.slice(idx) : "";
  return u.toString();
}

async function detectScheme(streamUrl, debugParts) {
  const base = new URL(streamUrl);
  for (const [schemeName, scheme] of Object.entries(PATH_SCHEMES)) {
    for (const n of DETECT_CHANNELS) {
      const candidateUrl = buildUrl(streamUrl, scheme.mainPath(n));
      const res = await describeWithRetry(candidateUrl);
      debugParts.push(fmt(res));
      if (res.status === 401 || res.status === 403) {
        return { error: "AUTH_FAILED" };
      }
      if (res.status === 200 && res.hasVideo) {
        return { schemeName, scheme };
      }
    }
  }
  return null;
}

async function discoverChannels(streamUrl) {
  const debugParts = [];

  const tcp = await tcpProbe(streamUrl);
  if (!tcp.reachable) {
    return { channels: [], error: tcp.errorCode, debug: debugParts.join(", ") };
  }

  const ownRes = await describeWithRetry(streamUrl);
  debugParts.push(fmt(ownRes));
  if (ownRes.status === 401 || ownRes.status === 403) {
    return { channels: [], error: "AUTH_FAILED", debug: debugParts.join(", ") };
  }

  let path;
  try {
    path = rtsp.parseUrl(streamUrl).path;
  } catch {
    path = "";
  }

  let matchedScheme = null;
  for (const scheme of Object.values(PATH_SCHEMES)) {
    if (scheme.matches(path)) {
      matchedScheme = scheme;
      break;
    }
  }

  if (!matchedScheme) {
    const detected = await detectScheme(streamUrl, debugParts);
    if (detected && detected.error) {
      return { channels: [], error: detected.error, debug: debugParts.join(", ") };
    }
    matchedScheme = detected ? detected.scheme : null;
  }

  if (!matchedScheme) {
    if (ownRes.status === 200 && ownRes.hasVideo) {
      const thumbnail = await grabThumbnail(streamUrl);
      return {
        channels: [{ channel: 1, label: "This camera", path, thumbnail }],
        debug: debugParts.join(", "),
      };
    }
    return { channels: [], error: "NO_CHANNELS_FOUND", debug: debugParts.join(", ") };
  }

  const channelNumbers = Array.from({ length: MAX_CHANNELS }, (_, i) => i + 1);
  const scanResults = await mapWithConcurrency(channelNumbers, SCAN_CONCURRENCY, async (n) => {
    const candidateUrl = buildUrl(streamUrl, matchedScheme.mainPath(n));
    const res = await describeWithRetry(candidateUrl);
    debugParts.push(fmt(res));
    if (res.status === 200 && res.hasVideo) {
      return { channel: n, mainPath: matchedScheme.mainPath(n) };
    }
    return null;
  });

  const found = scanResults.filter(Boolean);
  if (!found.length) {
    return { channels: [], error: "NO_CHANNELS_FOUND", debug: debugParts.join(", ") };
  }

  const withSub = await mapWithConcurrency(found, SCAN_CONCURRENCY, async (ch) => {
    const subPath = matchedScheme.subPath(ch.channel);
    const subUrl = buildUrl(streamUrl, subPath);
    const subRes = await describeWithRetry(subUrl);
    debugParts.push(fmt(subRes));
    const useSub = subRes.status === 200 && subRes.hasVideo;
    return { channel: ch.channel, path: useSub ? subPath : ch.mainPath };
  });

  const withThumbs = await mapWithConcurrency(withSub, THUMB_CONCURRENCY, async (ch) => {
    const fullUrl = buildUrl(streamUrl, ch.path);
    const thumbnail = await grabThumbnail(fullUrl);
    return { channel: ch.channel, path: ch.path, label: `Channel ${ch.channel}`, thumbnail };
  });

  return { channels: withThumbs, debug: debugParts.join(", ") };
}

class JobRunner extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
  }

  start(getToken) {
    this.stop();
    const tick = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const { data } = await api.listJobs(token);
        for (const job of data?.jobs || []) {
          void this.runJob(token, job);
        }
      } catch (err) {
        this.emit("error", err);
      }
    };
    tick();
    this.timer = setInterval(tick, JOB_POLL_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runJob(token, job) {
    let result;
    try {
      if (job.type === "DISCOVER") {
        result = await discoverChannels(job.streamUrl);
      } else if (job.type === "WEBRTC") {
        // required lazily to avoid any require-cycle risk with main.js wiring.
        const go2rtc = require("./go2rtc");
        const answer = await go2rtc.webrtcAnswer(job.cameraId, job.streamUrl, job.payload?.sdp);
        result = { answer };
      } else {
        result = await probeCamera(job.streamUrl);
      }
    } catch (err) {
      log.error(`[probe] job ${job.id} (${job.type}) failed:`, err.message);
      if (job.type === "DISCOVER") {
        result = { channels: [], error: "SCAN_FAILED" };
      } else if (job.type === "WEBRTC") {
        result = { error: "WEBRTC_FAILED" };
      } else {
        result = { reachable: false, errorCode: "PROBE_FAILED" };
      }
    }

    try {
      await api.postJobResult(token, job.id, result);
    } catch (err) {
      log.error(`[probe] failed to post result for job ${job.id}:`, err.message);
    }
  }
}

module.exports = new JobRunner();
