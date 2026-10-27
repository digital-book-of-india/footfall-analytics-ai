const { app } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const log = require("electron-log");
const { BACKEND_URL } = require("./config");

const MIN_RESTART_MS = 5000;
const MAX_RESTART_MS = 60000;
const HEALTHY_RUN_MS = 60000;

let child = null;
let stopped = true;
let restartDelay = MIN_RESTART_MS;
let restartTimer = null;
let startedAt = 0;

function runtimePaths() {
  if (app.isPackaged) {
    return {
      pythonPath: path.join(process.resourcesPath, "python", "python.exe"),
      workerCwd: path.join(process.resourcesPath, "ai-worker", "src"),
    };
  }
  return {
    pythonPath: process.env.FOOTFALL_PYTHON || "python",
    // apps/connector/src/lib -> apps/connector/src -> apps/connector -> apps -> apps/ai-worker/src
    workerCwd: path.join(__dirname, "..", "..", "..", "ai-worker", "src"),
  };
}

// AI worker stdout/stderr can include OpenCV/FFmpeg error lines that embed the full
// rtsp://user:pass@host/... URL on connection failures - strip credentials before logging.
function redact(line) {
  return String(line).replace(/rtsp:\/\/[^@/\s]+@/gi, "rtsp://***@");
}

function launch(identity) {
  const { pythonPath, workerCwd } = runtimePaths();

  startedAt = Date.now();
  child = spawn(pythonPath, ["main.py"], {
    cwd: workerCwd,
    env: {
      ...process.env,
      CORE_API_URL: BACKEND_URL,
      CONNECTOR_TOKEN: identity.connectorToken,
      WORKER_ID: `connector-${identity.connectorId}`,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
    },
  });

  child.stdout?.on("data", (buf) => log.info("[ai-worker]", redact(buf.toString()).trim()));
  child.stderr?.on("data", (buf) => log.warn("[ai-worker]", redact(buf.toString()).trim()));

  child.on("exit", (code, signal) => {
    child = null;
    if (stopped) return;

    const ranMs = Date.now() - startedAt;
    if (ranMs >= HEALTHY_RUN_MS) {
      restartDelay = MIN_RESTART_MS;
    } else {
      restartDelay = Math.min(restartDelay * 2, MAX_RESTART_MS);
    }

    log.warn(`[ai-worker] exited (code=${code}, signal=${signal}); restarting in ${restartDelay}ms`);
    restartTimer = setTimeout(() => {
      if (!stopped) launch(identity);
    }, restartDelay);
  });

  child.on("error", (err) => {
    log.error("[ai-worker] failed to start:", err.message);
  });
}

function start(identity) {
  stop();
  stopped = false;
  restartDelay = MIN_RESTART_MS;
  launch(identity);
}

function stop() {
  stopped = true;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  if (child && !child.killed) child.kill();
  child = null;
}

module.exports = { start, stop };
