import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRtspUrl, DEFAULT_RTSP_PATH } from '../utils/rtsp.js';
import { encryptCredential, decryptCredential, sanitizeStreamUrl } from '../utils/crypto.js';
import { resolveDecryptedStreamUrl, tryResolveDecryptedStreamUrl } from '../utils/cameraStream.js';
import {
  effectiveCameraStatus,
  CONNECTOR_CAMERA_STALE_MS,
  CLOUD_CAMERA_STALE_MS,
  NOT_REPORTING_CODE,
} from '../utils/cameraStatus.js';

// ---------- RTSP URL builder ----------

test('buildRtspUrl: defaults port 554 and path /stream1', () => {
  assert.equal(buildRtspUrl({ host: '192.168.1.50' }), `rtsp://192.168.1.50:554${DEFAULT_RTSP_PATH}`);
});

test('buildRtspUrl: special characters in user/password are percent-encoded and round-trip', () => {
  const password = 'p@ss#w:rd/?%&=+ é';
  const url = buildRtspUrl({ host: '10.0.0.5', port: 8554, username: 'ad min', password, path: 'Streaming/Channels/101' });

  const parsed = new URL(url);
  assert.equal(parsed.hostname, '10.0.0.5');
  assert.equal(parsed.port, '8554');
  assert.equal(parsed.pathname, '/Streaming/Channels/101');
  assert.equal(decodeURIComponent(parsed.username), 'ad min');
  assert.equal(decodeURIComponent(parsed.password), password);
  // the raw '@' of the password must not appear before the host separator
  assert.equal(url.indexOf('@'), url.lastIndexOf('@'));
});

test('buildRtspUrl: rejects bad host and port', () => {
  assert.throws(() => buildRtspUrl({ host: '' }));
  assert.throws(() => buildRtspUrl({ host: 'evil.com/x@y' }));
  assert.throws(() => buildRtspUrl({ host: '1.2.3.4', port: 70000 }));
  assert.throws(() => buildRtspUrl({ host: '1.2.3.4', port: 'abc' }));
});

test('buildRtspUrl: IPv6 host is bracketed', () => {
  assert.equal(buildRtspUrl({ host: '::1', path: '/s' }), 'rtsp://[::1]:554/s');
});

// ---------- encryption + credential merge ----------

test('encrypt/decrypt round-trips the whole URL', () => {
  const url = buildRtspUrl({ host: '192.168.1.9', username: 'admin', password: 'a@b#c' });
  assert.equal(decryptCredential(encryptCredential(url)), url);
  assert.ok(!encryptCredential(url).includes('admin'));
});

test('sanitizeStreamUrl strips credentials', () => {
  const clean = sanitizeStreamUrl(buildRtspUrl({ host: '192.168.1.9', username: 'admin', password: 'a@b#c' }));
  assert.ok(!clean.includes('admin') && !clean.includes('a%40b'));
});

function fakeCamera(streamUrl: string, creds?: { username: string; password: string }): any {
  return {
    _id: 'cam1',
    encryptedStreamUrl: encryptCredential(streamUrl),
    encryptedCredentials: creds ? encryptCredential(JSON.stringify(creds)) : undefined,
  };
}

test('resolveDecryptedStreamUrl merges separately stored credentials (with special chars)', () => {
  const password = 'p@ss#w:rd';
  const url = resolveDecryptedStreamUrl(fakeCamera('rtsp://192.168.1.9:554/stream1', { username: 'admin', password }));
  const parsed = new URL(url);
  assert.equal(decodeURIComponent(parsed.username), 'admin');
  assert.equal(decodeURIComponent(parsed.password), password);
  assert.equal(parsed.hostname, '192.168.1.9');
});

test('resolveDecryptedStreamUrl keeps credentials already embedded in the URL', () => {
  const embedded = 'rtsp://u:p@1.2.3.4:554/x';
  assert.equal(resolveDecryptedStreamUrl(fakeCamera(embedded, { username: 'other', password: 'other' })), embedded);
});

test('tryResolveDecryptedStreamUrl returns null instead of throwing for an undecryptable camera', () => {
  const bad: any = { _id: 'cam-bad', encryptedStreamUrl: 'aa:bb:cc' };
  const good = fakeCamera('rtsp://1.2.3.4:554/x');
  assert.equal(tryResolveDecryptedStreamUrl(bad), null);
  assert.equal(tryResolveDecryptedStreamUrl(good), 'rtsp://1.2.3.4:554/x');
});

// ---------- stale status rule ----------

const NOW = 1_800_000_000_000;
const ago = (ms: number) => new Date(NOW - ms);

test('stale rule: fresh ONLINE camera stays ONLINE', () => {
  assert.equal(effectiveCameraStatus({ status: 'ONLINE', lastHeartbeatAt: ago(10_000) }, NOW).status, 'ONLINE');
});

test('stale rule: ONLINE with no/old report becomes OFFLINE / NOT_REPORTING', () => {
  const none = effectiveCameraStatus({ status: 'ONLINE', lastHeartbeatAt: null }, NOW);
  assert.deepEqual(none, { status: 'OFFLINE', safeErrorCode: NOT_REPORTING_CODE });

  const old = effectiveCameraStatus({ status: 'ONLINE', lastHeartbeatAt: ago(CLOUD_CAMERA_STALE_MS + 1) }, NOW);
  assert.equal(old.status, 'OFFLINE');
});

test('stale rule: connector cameras get the longer 120s window', () => {
  const at100s = { status: 'ONLINE', connectorId: 'c1', lastHeartbeatAt: ago(100_000) };
  assert.equal(effectiveCameraStatus(at100s, NOW).status, 'ONLINE');
  assert.equal(effectiveCameraStatus({ ...at100s, connectorId: null }, NOW).status, 'OFFLINE'); // cloud: 90s
  assert.equal(
    effectiveCameraStatus({ ...at100s, lastHeartbeatAt: ago(CONNECTOR_CAMERA_STALE_MS + 1) }, NOW).status,
    'OFFLINE'
  );
});

test('stale rule: DEGRADED is also downgraded; non-"up" statuses and MOCK_STREAM are untouched', () => {
  assert.equal(effectiveCameraStatus({ status: 'DEGRADED', lastHeartbeatAt: ago(500_000) }, NOW).status, 'OFFLINE');
  for (const status of ['NEEDS_SETUP', 'CONNECTING', 'OFFLINE', 'CONFIG_ERROR']) {
    assert.equal(effectiveCameraStatus({ status, lastHeartbeatAt: null }, NOW).status, status);
  }
  assert.equal(
    effectiveCameraStatus({ status: 'DEGRADED', connectionType: 'MOCK_STREAM', lastHeartbeatAt: ago(999_999) }, NOW).status,
    'DEGRADED'
  );
});

test('stale rule: keeps the original error code when not stale', () => {
  const r = effectiveCameraStatus({ status: 'ONLINE', lastHeartbeatAt: ago(1000), safeErrorCode: 'X' }, NOW);
  assert.equal(r.safeErrorCode, 'X');
});
