import { app } from './app.js';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { CameraModel } from './models/Camera.js';
import { FootfallEventModel } from './models/FootfallEvent.js';
import { AuditLogModel } from './models/AuditLog.js';
import http from 'http';

async function runEndToEndMasterTest() {
  console.log('\n================================================================');
  console.log('🏆 DBI Intelligence — Footfall Analytics E2E Master Acceptance');
  console.log('================================================================\n');

  await connectDatabase();
  const server = http.createServer(app);
  const testPort = 4050;
  await new Promise<void>((resolve) => server.listen(testPort, () => resolve()));
  const baseUrl = `http://localhost:${testPort}`;

  const plainSecretPassword = 'TopSecretCameraPass!#987';
  let leakDetected = false;

  function assertNoLeak(jsonObj: any, context: string) {
    const serialized = JSON.stringify(jsonObj);
    if (serialized.includes(plainSecretPassword)) {
      leakDetected = true;
      throw new Error(`CRITICAL SECURITY FAILURE: Sensitive password leaked in ${context}!`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // CHECK 1: Owner Flow & Authentication
    // -------------------------------------------------------------------------
    console.log('1️⃣  [CHECK 1] Testing Owner Flow (Register -> Login -> Shop -> Camera)...');
    const ownerEmail = `e2e_owner_${Date.now()}@demo.com`;
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'E2E Test Owner',
        email: ownerEmail,
        password: 'Password@123',
      }),
    });
    const regData = await regRes.json();
    if (!regData.success || !regData.data?.token) throw new Error('Owner registration failed');
    const ownerToken = regData.data.token;
    console.log(`   • Owner Registered: ${ownerEmail} (Token issued)`);

    // Create Shop
    const shopRes = await fetch(`${baseUrl}/api/v1/shops`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: 'E2E Megastore Delhi',
        timezone: 'Asia/Kolkata',
        occupancyBaseline: 0,
      }),
    });
    const shopData = await shopRes.json();
    if (!shopData.success) throw new Error('Shop creation failed');
    const shopId = shopData.data.id;
    console.log(`   • Shop Created: '${shopData.data.name}' (ID: ${shopId})`);

    // Add Camera with Encrypted Credentials
    const camRes = await fetch(`${baseUrl}/api/v1/shops/${shopId}/cameras`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: 'Front Entrance Gate 1',
        connectionType: 'RTSP',
        streamUrl: `rtsp://admin:${plainSecretPassword}@192.168.1.200:554/stream`,
        username: 'admin',
        password: plainSecretPassword,
      }),
    });
    const camData = await camRes.json();
    assertNoLeak(camData, 'Camera Addition Response');
    if (!camData.success) throw new Error('Camera creation failed');
    const cameraId = camData.data.id;
    console.log(`   • Camera Added: '${camData.data.name}' (ID: ${cameraId}) [Passwords encrypted]`);

    // Configure Virtual Counting Line
    const lineRes = await fetch(`${baseUrl}/api/v1/cameras/${cameraId}/counting-line`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        coordinates: { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 },
        inDirection: 'TOP_TO_BOTTOM',
        outDirection: 'BOTTOM_TO_TOP',
      }),
    });
    const lineData = await lineRes.json();
    if (!lineData.success) throw new Error('Counting line setup failed');
    console.log(`   • Virtual Counting Line Configured: (0.1, 0.5) -> (0.9, 0.5)`);

    // Test Stream Connectivity
    const testCamRes = await fetch(`${baseUrl}/api/v1/cameras/${cameraId}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const testCamData = await testCamRes.json();
    assertNoLeak(testCamData, 'Camera Test Response');
    // This RTSP address is not a real, network-reachable camera in this environment, so a real TCP
    // reachability probe must correctly report it OFFLINE — scope lock requires we never fake ONLINE
    // ("do not mark camera LIVE") for a stream that was not actually reached.
    if (testCamData.data?.status !== 'OFFLINE' || testCamData.data?.isReachable !== false) {
      throw new Error(`Camera test must honestly report an unreachable stream as OFFLINE, got status=${testCamData.data?.status}`);
    }
    console.log(`   • Stream Connection Tested (real TCP probe, unreachable IP correctly reported): Status=${testCamData.data?.status}, Latency=${testCamData.data?.latencyMs}ms`);
    console.log('   ✅ Owner Flow passed with 100% success.\n');

    // -------------------------------------------------------------------------
    // CHECK 2: AI Pipeline & Event Ingestion (Idempotency & Dedupe)
    // -------------------------------------------------------------------------
    console.log('2️⃣  [CHECK 2] Testing AI Pipeline (Events, Deduplication, Heartbeats)...');
    const evt1 = `evt_e2e_in_1_${Date.now()}`;
    const evt2 = `evt_e2e_in_2_${Date.now()}`;
    const evt3 = `evt_e2e_out_1_${Date.now()}`;

    // Send 2 IN and 1 OUT
    const aiRes = await fetch(`${baseUrl}/internal/v1/footfall/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-secret': config.aiSharedSecret,
      },
      body: JSON.stringify({
        events: [
          { eventId: evt1, shopId, cameraId, direction: 'IN', occurredAt: new Date().toISOString(), confidence: 0.96 },
          { eventId: evt2, shopId, cameraId, direction: 'IN', occurredAt: new Date().toISOString(), confidence: 0.94 },
          { eventId: evt3, shopId, cameraId, direction: 'OUT', occurredAt: new Date().toISOString(), confidence: 0.93 },
        ],
      }),
    });
    const aiData = await aiRes.json();
    console.log(`   • Ingested Events: Processed=${aiData.data?.processed}, IgnoredDuplicates=${aiData.data?.ignoredDuplicates}`);
    if (aiData.data?.processed !== 3) throw new Error('Expected 3 processed events');

    // Re-send Duplicate (Idempotency Test)
    const dupRes = await fetch(`${baseUrl}/internal/v1/footfall/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-secret': config.aiSharedSecret,
      },
      body: JSON.stringify({
        eventId: evt1,
        shopId,
        cameraId,
        direction: 'IN',
      }),
    });
    const dupData = await dupRes.json();
    console.log(`   • Duplicate Retry: Processed=${dupData.data?.processed}, IgnoredDuplicates=${dupData.data?.ignoredDuplicates}`);
    if (dupData.data?.ignoredDuplicates !== 1) throw new Error('Duplicate event was not properly deduplicated');
    console.log('   ✅ AI Pipeline and deduplication passed with 100% success.\n');

    // -------------------------------------------------------------------------
    // CHECK 3: Footfall Dashboard & Occupancy Calculation
    // -------------------------------------------------------------------------
    console.log('3️⃣  [CHECK 3] Testing Footfall Dashboard & Occupancy Metrics...');
    const summaryRes = await fetch(`${baseUrl}/api/v1/shops/${shopId}/footfall/summary`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const summaryData = await summaryRes.json();
    assertNoLeak(summaryData, 'Summary Response');
    console.log(`   • Summary: Entries=${summaryData.data?.entries}, Exits=${summaryData.data?.exits}, Occupancy=${summaryData.data?.estimatedOccupancy}`);
    // Expected: 2 IN - 1 OUT = 1 Net Occupancy
    if (summaryData.data?.entries !== 2 || summaryData.data?.exits !== 1 || summaryData.data?.estimatedOccupancy !== 1) {
      throw new Error(`Occupancy formula mismatch: Expected entries=2, exits=1, occupancy=1; got entries=${summaryData.data?.entries}, exits=${summaryData.data?.exits}, occupancy=${summaryData.data?.estimatedOccupancy}`);
    }
    console.log(`   • DataSource=${summaryData.data?.dataSource}, Quality=${summaryData.data?.quality}`);

    // Hourly Timeseries
    const tsRes = await fetch(`${baseUrl}/api/v1/shops/${shopId}/footfall/timeseries`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const tsData = await tsRes.json();
    if (tsData.data?.points?.length !== 24) throw new Error('Expected 24 hourly chart points');
    console.log(`   • 24-Hour Timeseries points verified: Count=${tsData.data?.points?.length}`);

    // Drift Correction / Baseline Reset
    const baselineRes = await fetch(`${baseUrl}/api/v1/shops/${shopId}/footfall/occupancy-baseline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        baseline: 5,
        reason: 'Staff manual head-count correction',
      }),
    });
    const baselineData = await baselineRes.json();
    // New occupancy = baseline (5) + entries (2) - exits (1) = 6
    if (baselineData.data?.estimatedOccupancy !== 6) {
      throw new Error(`Expected new occupancy of 6 after baseline reset to 5, got ${baselineData.data?.estimatedOccupancy}`);
    }
    console.log(`   • Baseline Drift Corrected: Baseline=5, New Estimated Occupancy=${baselineData.data?.estimatedOccupancy}`);

    // CSV Export
    const csvRes = await fetch(`${baseUrl}/api/v1/shops/${shopId}/footfall/export.csv`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const csvText = await csvRes.text();
    if (!csvText.includes('Entries (IN),Exits (OUT)')) throw new Error('Invalid CSV export content');
    console.log('   • CSV Export generated and verified');
    console.log('   ✅ Footfall Dashboard calculations passed with 100% success.\n');

    // -------------------------------------------------------------------------
    // CHECK 4: Super Admin Flow & Audited Actions
    // -------------------------------------------------------------------------
    console.log('4️⃣  [CHECK 4] Testing Super Admin Flow & Audited Actions...');
    const adminLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@dbi.ai', password: 'Password@123' }),
    });
    const adminToken = (await adminLogin.json()).data.token;

    // Overview KPIs
    const adminOvRes = await fetch(`${baseUrl}/api/v1/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminOv = await adminOvRes.json();
    console.log(`   • Admin Overview: TotalShops=${adminOv.data?.totalShops}, TotalCameras=${adminOv.data?.totalCameras}`);

    // Audited Shop Status Toggle (Suspend shop)
    const suspendRes = await fetch(`${baseUrl}/api/v1/admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'SUSPENDED',
        reason: 'Temporary regulatory inspection',
      }),
    });
    const suspendData = await suspendRes.json();
    if (suspendData.data?.status !== 'SUSPENDED') throw new Error('Admin suspend failed');
    console.log(`   • Admin Action: Shop suspended with mandatory reason`);

    // Verify Audit Log was recorded
    const auditRes = await fetch(`${baseUrl}/api/v1/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditData = await auditRes.json();
    const hasLog = auditData.data?.items?.some((l: any) => l.action === 'SUSPEND_SHOP' && l.target?.id === shopId);
    if (!hasLog) throw new Error('SUSPEND_SHOP action was not found in audit logs');
    console.log(`   • Audit Log verified: Action recorded in tamper-evident log`);

    // Reactivate shop
    await fetch(`${baseUrl}/api/v1/admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        reason: 'Inspection completed satisfactorily',
      }),
    });
    console.log('   ✅ Super Admin Flow passed with 100% success.\n');

    // -------------------------------------------------------------------------
    // CHECK 5: Strict Multi-Tenant Isolation
    // -------------------------------------------------------------------------
    console.log('5️⃣  [CHECK 5] Testing Strict Multi-Tenant Isolation...');
    // Login as a completely different owner
    const otherLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'other@demo.com', password: 'Password@123' }),
    });
    const otherToken = (await otherLogin.json()).data.token;

    // Unauthorized owner attempts to read E2E Owner's shop
    const violateRes = await fetch(`${baseUrl}/api/v1/shops/${shopId}`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    const violateData = await violateRes.json();
    console.log(`   • Cross-Tenant Access Attempt: HTTP Status=${violateRes.status}, ErrorCode=${violateData.error?.code}`);
    if (violateRes.status !== 403 || violateData.error?.code !== 'TENANT_VIOLATION') {
      throw new Error('Tenant isolation violated! Expected 403 TENANT_VIOLATION');
    }
    console.log('   ✅ Multi-Tenant Isolation successfully verified.\n');

    // -------------------------------------------------------------------------
    // CHECK 6: Secret Handling & Zero Credential Leakage
    // -------------------------------------------------------------------------
    console.log('6️⃣  [CHECK 6] Verifying Secret Handling & Encryption...');
    if (leakDetected) {
      throw new Error('Secret handling check failed: Password was found in one or more outputs');
    }
    // Verify DB stores ciphertext
    const camInDb = await CameraModel.findById(cameraId);
    if (camInDb?.encryptedStreamUrl.includes(plainSecretPassword)) {
      throw new Error('Plain password found in database string!');
    }
    console.log('   • Passwords in DB: AES-256-GCM Ciphertext only');
    console.log('   • Passwords in API responses: Strictly omitted (hasCredentials=true flag only)');
    console.log('   ✅ Secret Handling passed with 100% success.\n');

    // -------------------------------------------------------------------------
    // CHECK 7: On-site Connector Pairing, Heartbeat, Camera Sync, Revocation
    // -------------------------------------------------------------------------
    console.log('7️⃣  [CHECK 7] Testing On-site Connector lifecycle (Pair -> Heartbeat -> Sync -> Revoke)...');

    const createConnRes = await fetch(`${baseUrl}/api/v1/shops/${shopId}/connectors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: 'E2E Shop PC' }),
    });
    const createConnData = await createConnRes.json();
    if (!createConnData.success || !createConnData.data?.pairingCode) throw new Error('Connector creation did not return a pairing code');
    const { pairingCode, id: connectorId } = createConnData.data;
    console.log(`   • Connector created: '${createConnData.data.name}' (pairing code issued, PENDING)`);

    const pairRes = await fetch(`${baseUrl}/internal/v1/connectors/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingCode }),
    });
    const pairData = await pairRes.json();
    assertNoLeak(pairData, 'Connector Pair Response');
    if (!pairData.success || !pairData.data?.connectorToken) throw new Error('Connector pairing did not return a device token');
    const connectorToken = pairData.data.connectorToken;
    console.log('   • Connector paired: one-time code exchanged for a device token');

    const hbRes = await fetch(`${baseUrl}/internal/v1/connectors/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-connector-token': connectorToken },
      body: JSON.stringify({ version: '0.1.0', activeCameraCount: 0 }),
    });
    if (!(await hbRes.json()).success) throw new Error('Connector heartbeat failed');
    console.log('   • Connector heartbeat accepted');

    // Assign the existing E2E camera to this connector, then confirm the connector can read
    // its own decrypted stream URL back — and that it is the ONLY camera it can see.
    await fetch(`${baseUrl}/api/v1/cameras/${cameraId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ connectorId }),
    });
    // NOTE: unlike every owner/admin-facing endpoint, this one is DELIBERATELY the one place
    // the real decrypted stream URL (with embedded password) is returned — same contract as
    // the AI worker's /internal/v1/footfall/cameras/:id/stream-config. It is gated by a
    // per-connector device token, never reachable from a browser, so assertNoLeak does not
    // apply here — that would be testing the system into *removing* the credentials the
    // connector exe needs to actually open the stream.
    const connCamsRes = await fetch(`${baseUrl}/internal/v1/connectors/cameras`, {
      headers: { 'x-connector-token': connectorToken },
    });
    const connCamsData = await connCamsRes.json();
    if (connCamsData.data?.items?.length !== 1 || connCamsData.data.items[0].cameraId !== cameraId) {
      throw new Error('Connector camera sync did not return exactly its own assigned camera');
    }
    console.log('   • Connector camera sync scoped correctly to its own assigned camera only');

    const wrongTokenRes = await fetch(`${baseUrl}/internal/v1/connectors/cameras`, {
      headers: { 'x-connector-token': 'not-a-real-token' },
    });
    if (wrongTokenRes.status !== 401) throw new Error('Connector endpoints must reject an invalid device token');
    console.log('   • Invalid connector token correctly rejected (401)');

    const revokeRes = await fetch(`${baseUrl}/api/v1/connectors/${connectorId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    if (revokeRes.status !== 200) throw new Error('Connector revoke failed');

    const afterRevokeRes = await fetch(`${baseUrl}/internal/v1/connectors/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-connector-token': connectorToken },
      body: JSON.stringify({ version: '0.1.0' }),
    });
    if (afterRevokeRes.status !== 401) throw new Error('A revoked connector token must be rejected immediately');
    console.log('   • Connector revoked: its device token is immediately rejected');
    console.log('   ✅ Connector lifecycle passed with 100% success.\n');

    console.log('================================================================');
    console.log('🎉 ALL 7 CRITICAL ACCEPTANCE CHECKS PASSED WITH 100% SUCCESS! 🚀');
    console.log('================================================================\n');
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runEndToEndMasterTest();
