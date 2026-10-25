const { EventEmitter } = require("events");
const api = require("./api");
const { CAMERA_SYNC_INTERVAL_MS } = require("./config");

// Polls the backend for this shop's camera list (the ones assigned to this connector) and
// reconciles per-camera workers.
//
// STAGE 1 (this file, today): fetch + diff the camera list, emit events so the tray UI
// can show "N cameras configured". No RTSP/footfall-counting workers are started yet.
//
// STAGE 2 (next): on 'camera-added', spawn a worker that pulls RTSP frames and submits
// IN/OUT crossing events to POST /internal/v1/footfall/events, the same contract the cloud
// Python ai-worker already uses (see apps/ai-worker/src/main.py) — this file only needs to
// hand that worker manager the reconciled camera list, not rewrite the polling loop.
class CameraSync extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.known = new Map(); // cameraId -> camera record
  }

  start(getToken) {
    this.stop();
    const tick = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const { data } = await api.listCameras(token);
        this._reconcile(data?.items || []);
      } catch (err) {
        this.emit("error", err);
      }
    };
    tick();
    this.timer = setInterval(tick, CAMERA_SYNC_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  _reconcile(items) {
    const seen = new Set();
    for (const cam of items) {
      seen.add(cam.cameraId);
      if (!this.known.has(cam.cameraId)) {
        this.known.set(cam.cameraId, cam);
        this.emit("camera-added", cam);
      }
    }
    for (const [cameraId, cam] of this.known) {
      if (!seen.has(cameraId)) {
        this.known.delete(cameraId);
        this.emit("camera-removed", cam);
      }
    }
    this.emit("synced", { count: this.known.size });
  }

  get count() {
    return this.known.size;
  }
}

module.exports = new CameraSync();
