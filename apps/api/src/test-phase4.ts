import { app } from './app.js';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { ShopModel } from './models/Shop.js';
import { CameraModel } from './models/Camera.js';
import { FootfallEventModel } from './models/FootfallEvent.js';
import http from 'http';

async function runPhase4Verification() {
  console.log('\n🧪 --- Starting Phase 4 Verification Test --- 🧪');
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4003, () => resolve()));
  const baseUrl = 'http://localhost:4003';

  try {
    // 1. Get test shop and camera
    const shop = await ShopModel.findOne({ name: 'DBI Flagship Retail Store' });
    const camera = await CameraModel.findOne({ shopId: shop!._id });
    if (!shop || !camera) throw new Error('Seeded shop or camera not found');

    const shopId = shop._id.toString();
    const cameraId = camera._id.toString();

    // 2. Test Internal Auth Guard Rejection (Missing / Wrong secret)
    console.log('\n1. Testing Internal Auth Guard rejection with missing/wrong secret...');
    const unauthorizedRes = await fetch(`${baseUrl}/internal/v1/footfall/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: 'evt_test_unauth',
        shopId,
        cameraId,
        direction: 'IN',
      }),
    });
    console.log(`Unauthorized status: ${unauthorizedRes.status}`);
    if (unauthorizedRes.status !== 401 && unauthorizedRes.status !== 403) {
      throw new Error(`Expected 401/403 for missing secret, got ${unauthorizedRes.status}`);
    }
    console.log('✅ Internal Auth Guard successfully blocked unauthenticated request');

    // 3. Test Event Ingestion with Valid AI Secret
    console.log('\n2. Testing Event Ingestion with valid x-ai-secret...');
    const eventId1 = 'evt_test_001_' + Date.now();
    const eventId2 = 'evt_test_002_' + Date.now();

    const ingestRes = await fetch(`${baseUrl}/internal/v1/footfall/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-secret': config.aiSharedSecret,
      },
      body: JSON.stringify({
        events: [
          {
            eventId: eventId1,
            shopId,
            cameraId,
            direction: 'IN',
            occurredAt: new Date().toISOString(),
            confidence: 0.95,
            modelVersion: 'yolo-crossing-v1.0',
          },
          {
            eventId: eventId2,
            shopId,
            cameraId,
            direction: 'OUT',
            occurredAt: new Date().toISOString(),
            confidence: 0.92,
            modelVersion: 'yolo-crossing-v1.0',
          },
        ],
      }),
    });

    const ingestData = await ingestRes.json();
    console.log(`Ingest Status: ${ingestRes.status}, Processed: ${ingestData.data?.processed}, Ignored: ${ingestData.data?.ignoredDuplicates}`);
    if (ingestData.data?.processed !== 2 || ingestData.data?.ignoredDuplicates !== 0) {
      throw new Error('Expected 2 processed events and 0 ignored duplicates');
    }
    console.log('✅ Ingested IN and OUT crossing events successfully');

    // 4. Test Strict Deduplication & Idempotency
    console.log('\n3. 🛡️  Testing Deduplication & Idempotency (Re-sending duplicate eventId1)...');
    const duplicateRes = await fetch(`${baseUrl}/internal/v1/footfall/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-secret': config.aiSharedSecret,
      },
      body: JSON.stringify({
        eventId: eventId1, // Duplicate event!
        shopId,
        cameraId,
        direction: 'IN',
        occurredAt: new Date().toISOString(),
        confidence: 0.95,
        modelVersion: 'yolo-crossing-v1.0',
      }),
    });

    const duplicateData = await duplicateRes.json();
    console.log(`Duplicate Ingest: Processed: ${duplicateData.data?.processed}, IgnoredDuplicates: ${duplicateData.data?.ignoredDuplicates}`);
    if (duplicateData.data?.processed !== 0 || duplicateData.data?.ignoredDuplicates !== 1) {
      throw new Error('Deduplication failed! Duplicate event was not ignored');
    }

    const countInDb = await FootfallEventModel.countDocuments({ eventId: eventId1 });
    if (countInDb !== 1) {
      throw new Error(`CRITICAL: Found ${countInDb} instances of eventId in database instead of 1!`);
    }
    console.log('✅ Deduplication verified: Duplicate eventId safely ignored, database holds exactly 1 copy');

    // 5. Test AI Heartbeat Endpoint
    console.log('\n4. Testing POST /internal/v1/footfall/health...');
    const heartbeatRes = await fetch(`${baseUrl}/internal/v1/footfall/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-secret': config.aiSharedSecret,
      },
      body: JSON.stringify({
        cameraId,
        status: 'ONLINE',
        fps: 29.8,
        droppedFrames: 0,
      }),
    });
    const heartbeatData = await heartbeatRes.json();
    console.log(`Heartbeat Status: ${heartbeatRes.status}, Acknowledged: ${heartbeatData.data?.acknowledged}`);
    if (!heartbeatData.data?.acknowledged) throw new Error('Heartbeat was not acknowledged');
    console.log('✅ AI worker heartbeat processed and recorded');

    // 6. Test Stale Camera Detector (Timeout > 90s)
    console.log('\n5. ⏱️  Testing Stale Camera Heartbeat Detector (> 90 seconds)...');
    // Artificially age the camera's heartbeat to 120 seconds in the past
    const staleTime = new Date(Date.now() - 120 * 1000);
    await CameraModel.findByIdAndUpdate(cameraId, {
      status: 'ONLINE',
      lastHeartbeatAt: staleTime,
    });

    // Login as owner to inspect health
    const ownerLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@demo.com', password: 'Password@123' }),
    });
    const ownerToken = (await ownerLogin.json()).data.token;

    const healthCheckRes = await fetch(`${baseUrl}/api/v1/cameras/${cameraId}/health`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const healthCheckData = await healthCheckRes.json();
    console.log(`Camera Evaluated Status: ${healthCheckData.data?.status}, ErrorCode: ${healthCheckData.data?.safeErrorCode}`);
    if (healthCheckData.data?.status !== 'OFFLINE' || healthCheckData.data?.safeErrorCode !== 'HEARTBEAT_TIMEOUT') {
      throw new Error('Stale detector failed! Camera should be marked OFFLINE after 90s without heartbeat');
    }
    console.log('✅ Stale camera heartbeat correctly transitioned camera to OFFLINE with HEARTBEAT_TIMEOUT');

    console.log('\n🎉 ✅ ALL PHASE 4 TESTS PASSED PERFECTLY!\n');
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runPhase4Verification();
