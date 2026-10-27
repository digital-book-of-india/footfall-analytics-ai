const { app } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const API_PORT = 11984;
const WEBRTC_PORT = 18555;
const READY_TIMEOUT_MS = 8000;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

let child = null;
let readyPromise = null;

function binaryPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "go2rtc", "go2rtc.exe");
  }
  return process.env.FOOTFALL_GO2RTC || "go2rtc";
}

function configPath() {
  return path.join(app.getPath("userData"), "go2rtc.yaml");
}

function writeConfig() {
  const yaml =
    `api:\n  listen: "127.0.0.1:${API_PORT}"\n` +
    `rtsp:\n  listen: ""\n` +
    `webrtc:\n  listen: ":${WEBRTC_PORT}"\n  ice_servers:\n    - urls: [stun:stun.cloudflare.com:3478]\n` +
    `log:\n  level: warn\n`;
  fs.writeFileSync(configPath(), yaml, "utf8");
  return configPath();
}

function spawnProcess() {
  const configFile = writeConfig();
  // go2rtc can print stream URLs (with camera credentials embedded) to its own console -
  // stdio is deliberately ignored so nothing from it ever reaches our logs.
  child = spawn(binaryPath(), ["-config", configFile], { stdio: "ignore" });
  child.on("exit", () => {
    child = null;
    readyPromise = null;
  });
  child.on("error", () => {
    child = null;
    readyPromise = null;
  });
}

async function isReady() {
  try {
    const res = await fetch(`${API_BASE}/api/streams`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitUntilReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isReady()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("go2rtc did not become ready in time");
}

function ensureRunning() {
  if (readyPromise) return readyPromise;
  if (!child) spawnProcess();
  readyPromise = waitUntilReady().catch((err) => {
    readyPromise = null;
    throw err;
  });
  return readyPromise;
}

function streamNameFor(cameraId, streamUrl) {
  const hash = crypto.createHash("sha1").update(streamUrl).digest("hex").slice(0, 8);
  return `cam-${cameraId}-${hash}`;
}

async function webrtcAnswer(cameraId, streamUrl, offerSdp) {
  await ensureRunning();
  const name = streamNameFor(cameraId, streamUrl);

  const putRes = await fetch(`${API_BASE}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(streamUrl)}`, {
    method: "PUT",
    signal: AbortSignal.timeout(8000),
  });
  if (!putRes.ok) {
    throw new Error(`go2rtc failed to register stream (${putRes.status})`);
  }

  const answerRes = await fetch(`${API_BASE}/api/webrtc?src=${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offerSdp,
    signal: AbortSignal.timeout(12000),
  });
  const answerText = await answerRes.text();
  if (!answerRes.ok) {
    throw new Error(`go2rtc WebRTC answer failed (${answerRes.status})`);
  }
  if (!answerText.startsWith("v=0")) {
    throw new Error("go2rtc returned an invalid SDP answer");
  }
  return answerText;
}

function stop() {
  if (child && !child.killed) child.kill();
  child = null;
  readyPromise = null;
}

module.exports = { ensureRunning, webrtcAnswer, stop, API_PORT, WEBRTC_PORT };
