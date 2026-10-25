// Headless proof that the Connector app's REAL code (src/lib/api.js, src/lib/cameraSync.js —
// unmodified, the exact files main.js uses) can pair, sync its assigned camera, heartbeat,
// and get rejected after revoke. Skips only the Electron-GUI wrapper (main.js/BrowserWindow/
// Tray/heartbeat.js's app.getVersion()) which this shell has no desktop session to run.
const path = require('path');

async function main() {
  const base = 'http://localhost:4000';

  // --- Act as the shop owner: register, create a shop + camera ---
  const email = 'connector_headless_' + Date.now() + '@demo.com';
  const reg = await fetch(base + '/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Headless Test Owner', email, password: 'Password@123' }),
  }).then((r) => r.json());
  const ownerToken = reg.data.token;
  console.log('✓ Owner registered:', email);

  const shop = await fetch(base + '/api/v1/shops', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ name: 'Headless Connector Test Shop', timezone: 'Asia/Kolkata' }),
  }).then((r) => r.json());
  const shopId = shop.data.id;
  console.log('✓ Shop created:', shop.data.name);

  const cam = await fetch(base + `/api/v1/shops/${shopId}/cameras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ name: 'Backroom LAN Camera', connectionType: 'RTSP', streamUrl: 'rtsp://192.168.1.80:554/stream' }),
  }).then((r) => r.json());
  const cameraId = cam.data.id;
  console.log('✓ Camera created (not yet assigned to a connector):', cam.data.name);

  const connCreate = await fetch(base + `/api/v1/shops/${shopId}/connectors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ name: 'Headless Test PC' }),
  }).then((r) => r.json());
  const { pairingCode, id: connectorId } = connCreate.data;
  console.log(`✓ Connector created in owner panel, pairing code issued: ${pairingCode}`);

  // --- Now switch hats: this is literally what the Connector exe does ---
  process.env.DBI_CONNECTOR_BACKEND_URL = base;
  const fs = require('fs');
  fs.writeFileSync(path.join(__dirname, 'src/lib/runtime-config.json'), JSON.stringify({ backendUrl: base }));

  const api = require('./src/lib/api.js'); // the REAL unmodified connector HTTP client
  const cameraSync = require('./src/lib/cameraSync.js'); // the REAL unmodified sync loop

  const pairResult = await api.pair(pairingCode);
  if (!pairResult.success) throw new Error('Connector pairing FAILED: ' + JSON.stringify(pairResult));
  const connectorToken = pairResult.data.connectorToken;
  console.log(`✓ Connector app paired successfully -> connected to shop "${pairResult.data.shopName}"`);

  // Assign the camera to this connector (owner action, e.g. picked in the Edit Camera form)
  await fetch(base + `/api/v1/cameras/${cameraId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
    body: JSON.stringify({ connectorId }),
  });
  console.log('✓ Owner assigned the camera to this connector');

  // Run the REAL cameraSync loop and wait for its first 'synced' tick
  const synced = await new Promise((resolve, reject) => {
    cameraSync.once('synced', resolve);
    cameraSync.once('error', reject);
    cameraSync.start(() => connectorToken);
  });
  cameraSync.stop();
  if (synced.count !== 1) throw new Error(`Expected cameraSync to pick up exactly 1 camera, got ${synced.count}`);
  console.log(`✓ Connector's cameraSync picked up its assigned camera (count=${synced.count}) — THIS IS THE CONNECTION WORKING`);

  // Heartbeat (same call heartbeat.js makes every 45s; app.getVersion() swapped for a literal
  // version string here since there's no Electron app object outside a real Electron process)
  const hb = await api.heartbeat(connectorToken, { version: 'headless-test-1.0.0', activeCameraCount: 1 });
  if (!hb.success) throw new Error('Heartbeat failed: ' + JSON.stringify(hb));
  console.log('✓ Heartbeat accepted by backend');

  // Confirm from the OWNER's side (the real signal a human would see in the panel)
  const ownerView = await fetch(base + `/api/v1/shops/${shopId}/connectors`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  }).then((r) => r.json());
  const seen = ownerView.data.find((c) => c.id === connectorId);
  if (!seen || seen.status !== 'PAIRED' || !seen.online || seen.activeCameraCount !== 1) {
    throw new Error('Owner panel does not show the connector as online/paired with its camera: ' + JSON.stringify(seen));
  }
  console.log(`✓ Owner panel shows connector ONLINE, status=${seen.status}, cameras=${seen.activeCameraCount}, version=${seen.lastSeenVersion}`);

  // Revoke and confirm the device is immediately locked out
  await fetch(base + `/api/v1/connectors/${connectorId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ownerToken}` } });
  let revokedCorrectly = false;
  try {
    await api.heartbeat(connectorToken, { version: 'headless-test-1.0.0' });
  } catch (err) {
    revokedCorrectly = err.status === 401;
  }
  if (!revokedCorrectly) throw new Error('A revoked connector token should make api.heartbeat throw a 401');
  console.log('✓ After revoke, the connector token is correctly rejected (401) — exactly what heartbeat.js\'s onUnauthorized handler listens for');

  console.log('\n🎉 CONNECTOR <-> CAMERA CONNECTION VERIFIED END-TO-END (real app code, live API)\n');
}

main().catch((err) => {
  console.error('\n❌ HEADLESS CONNECTOR TEST FAILED:', err.message);
  process.exit(1);
});
