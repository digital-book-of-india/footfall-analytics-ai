const { BACKEND_URL } = require("./config");

const REQUEST_TIMEOUT_MS = 15 * 1000;

async function postJson(path, body, token) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-connector-token": token } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function getJson(path, token) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: token ? { "x-connector-token": token } : {},
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Exchanges a one-time pairing code (generated in the owner panel) for a long-lived
// connector token. See apps/api POST /internal/v1/connectors/pair.
function pair(pairingCode) {
  return postJson("/internal/v1/connectors/pair", { pairingCode });
}

// Sent every HEARTBEAT_INTERVAL_MS so the owner panel can show "online - seen just now".
function heartbeat(token, { version, activeCameraCount }) {
  return postJson("/internal/v1/connectors/heartbeat", { version, activeCameraCount }, token);
}

// Pulls this shop's camera list (decrypted stream URL + credentials) so the connector can
// reconcile which per-camera workers should be running.
function listCameras(token) {
  return getJson("/internal/v1/connectors/cameras", token);
}

// Polled every JOB_POLL_INTERVAL_MS - hands back any pending PROBE/DISCOVER/WEBRTC jobs
// the backend wants this connector's LAN to carry out (see apps/api's job queue).
function listJobs(token) {
  return getJson("/internal/v1/connectors/jobs", token);
}

function postJobResult(token, jobId, result) {
  return postJson(`/internal/v1/connectors/jobs/${jobId}/result`, result, token);
}

module.exports = { pair, heartbeat, listCameras, listJobs, postJobResult, BACKEND_URL };
