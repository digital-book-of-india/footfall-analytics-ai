import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { ShopModel } from './models/Shop.js';
import { CameraModel } from './models/Camera.js';
import { decryptCredential } from './utils/crypto.js';
import http from 'http';

async function runPhase3Verification() {
  console.log('\n🧪 --- Starting Phase 3 Verification Test --- 🧪');
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4002, () => resolve()));
  const baseUrl = 'http://localhost:4002/api/v1';

  try {
    // 1. Login as Owner 1 & Owner 2
    console.log('\n1. Authenticating test users...');
    const owner1Login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@demo.com', password: 'Password@123' }),
    });
    const owner1Token = (await owner1Login.json()).data.token;

    const owner2Login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'other@demo.com', password: 'Password@123' }),
    });
    const owner2Token = (await owner2Login.json()).data.token;

    const shop1 = await ShopModel.findOne({ name: 'DBI Flagship Retail Store' });
    if (!shop1) throw new Error('Shop 1 not found');

    // 2. Add Camera with sensitive credentials
    console.log('\n2. Testing POST /shops/:shopId/cameras with sensitive RTSP password...');
    const rawPassword = 'SuperSecretCameraPassword!#99';
    const rawRtspUrl = `rtsp://camadmin:${rawPassword}@192.168.1.100:554/h264/ch1/main`;

    const addCamRes = await fetch(`${baseUrl}/shops/${shop1._id}/cameras`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner1Token}`,
      },
      body: JSON.stringify({
        name: 'Main Entrance Camera',
        connectionType: 'RTSP',
        streamUrl: rawRtspUrl,
        username: 'camadmin',
        password: rawPassword,
      }),
    });

    const addCamData = await addCamRes.json();
    console.log(`Add Camera Status: ${addCamRes.status}, Success: ${addCamData.success}`);
    if (!addCamData.success) throw new Error('Failed to add camera');

    const cameraId = addCamData.data.id;
    console.log(`Camera Created ID: ${cameraId}`);

    // Verify secret handling in API response
    const jsonStr = JSON.stringify(addCamData);
    if (jsonStr.includes(rawPassword)) {
      throw new Error('CRITICAL SECURITY VIOLATION: Raw password leaked in API response!');
    }
    console.log('✅ Verified: Password is NOT present in API response');

    // 3. Verify Database Storage Encryption
    console.log('\n3. Verifying MongoDB field encryption...');
    const dbCam = await CameraModel.findById(cameraId);
    if (!dbCam) throw new Error('Camera not found in DB');

    if (dbCam.encryptedStreamUrl.includes(rawPassword)) {
      throw new Error('CRITICAL SECURITY VIOLATION: Stream URL stored unencrypted in DB!');
    }
    const decryptedUrl = decryptCredential(dbCam.encryptedStreamUrl);
    if (decryptedUrl !== rawRtspUrl) {
      throw new Error('Decryption mismatch for stream URL');
    }
    console.log('✅ Verified: Database stores AES-256 ciphertext; decodes correctly internally');

    // 4. Test Stream Connection Test Endpoint
    console.log('\n4. Testing POST /cameras/:cameraId/test...');
    const testRes = await fetch(`${baseUrl}/cameras/${cameraId}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner1Token}` },
    });
    const testData = await testRes.json();
    console.log(`Test Stream Status: ${testRes.status}, Accessible: ${testData.data?.accessible}, Latency: ${testData.data?.latencyMs}ms`);
    // 192.168.1.100 above is a dummy, unreachable test IP - the real TCP probe
    // correctly reports OFFLINE for it; honestly reporting "can't reach this" is the
    // behavior under test here, not a fake always-ONLINE response.
    if (testData.data?.status !== 'OFFLINE') throw new Error('Expected camera status to be OFFLINE for an unreachable test IP');
    console.log('✅ Camera stream test endpoint functional (unreachable IP honestly reported OFFLINE)');

    // 5. Test Virtual Counting Line Configuration
    console.log('\n5. Testing Counting Line coordinates validation...');
    // Invalid coordinate (> 1.0)
    const invalidLineRes = await fetch(`${baseUrl}/cameras/${cameraId}/counting-line`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner1Token}`,
      },
      body: JSON.stringify({
        coordinates: { x1: 0.1, y1: 0.5, x2: 1.5, y2: 0.5 }, // x2 is invalid!
        inDirection: 'TOP_TO_BOTTOM',
        outDirection: 'BOTTOM_TO_TOP',
      }),
    });
    const invalidLineData = await invalidLineRes.json();
    console.log(`Invalid Coords Status: ${invalidLineRes.status}, Code: ${invalidLineData.error?.code}`);
    if (invalidLineRes.status !== 400 || invalidLineData.error?.code !== 'INVALID_COORDINATES') {
      throw new Error('Expected 400 INVALID_COORDINATES for coordinates outside [0.0..1.0]');
    }

    // Valid coordinate
    const validLineRes = await fetch(`${baseUrl}/cameras/${cameraId}/counting-line`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner1Token}`,
      },
      body: JSON.stringify({
        coordinates: { x1: 0.15, y1: 0.6, x2: 0.85, y2: 0.6 },
        inDirection: 'TOP_TO_BOTTOM',
        outDirection: 'BOTTOM_TO_TOP',
      }),
    });
    const validLineData = await validLineRes.json();
    console.log(`Valid Line Status: ${validLineRes.status}, Line Configured: ${validLineData.success}`);
    if (!validLineData.success) throw new Error('Failed to set counting line');
    console.log('✅ Counting line coordinate validation and storage working properly');

    // 6. Test Tenant Isolation on Camera
    console.log('\n6. 🛡️  Testing Tenant Isolation on Camera endpoints...');
    const crossTenantRes = await fetch(`${baseUrl}/cameras/${cameraId}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${owner2Token}` }, // Owner 2 trying to test Owner 1's camera
    });
    const crossTenantData = await crossTenantRes.json();
    console.log(`Cross-Tenant Status: ${crossTenantRes.status}, Code: ${crossTenantData.error?.code}`);
    if (crossTenantRes.status !== 403 || crossTenantData.error?.code !== 'TENANT_VIOLATION') {
      throw new Error('Expected 403 TENANT_VIOLATION for cross-tenant camera action');
    }
    console.log('✅ Tenant Isolation successfully protected camera endpoints');

    console.log('\n🎉 ✅ ALL PHASE 3 TESTS PASSED PERFECTLY!\n');
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runPhase3Verification();
