const net = require("net");
const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const path = require("path");
const { app } = require("electron");
const log = require("electron-log");
const rtsp = require("./rtsp");
const api = require("./api");
const { createScanner } = require("./scan");
const { JOB_POLL_INTERVAL_MS } = require("./config");

const THUMB_TIMEOUT_MS = 15000;

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

const { probeCamera, discoverChannels } = createScanner({
  tcpProbe,
  describe: (url) => rtsp.describe(url),
  grabThumbnail,
  parsePath: (url) => rtsp.parseUrl(url).path,
});

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
