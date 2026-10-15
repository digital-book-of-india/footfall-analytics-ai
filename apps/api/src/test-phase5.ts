import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { ShopModel } from './models/Shop.js';
import { CameraModel } from './models/Camera.js';
import { FootfallEventModel } from './models/FootfallEvent.js';
import { AuditLogModel } from './models/AuditLog.js';
import http from 'http';

async function runPhase5Verification() {
  console.log('\n🧪 --- Starting Phase 5 Verification Test --- 🧪');
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4004, () => resolve()));
  const baseUrl = 'http://localhost:4004/api/v1';

  try {
    // 1. Authenticate Owner & Super Admin
    console.log('\n1. Authenticating Owner and Super Admin...');
    const ownerLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@demo.com', password: 'Password@123' }),
    });
    const ownerToken = (await ownerLogin.json()).data.token;

    const adminLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@dbi.ai', password: 'Password@123' }),
    });
    const adminToken = (await adminLogin.json()).data.token;

    const shop = await ShopModel.findOne({ name: 'DBI Flagship Retail Store' });
    const camera = await CameraModel.findOne({ shopId: shop!._id });
    if (!shop || !camera) throw new Error('Seeded shop or camera not found');
    const shopId = shop._id.toString();

    // 2. Insert some realistic test events for today
    console.log('\n2. Populating test events for calculations...');
    const now = new Date();
    // 5 IN events, 2 OUT events -> net = +3
    for (let i = 0; i < 5; i++) {
      const evtId = `evt_p5_in_${i}_${Date.now()}`;
      await FootfallEventModel.create({
        eventId: evtId,
        shopId: shop._id,
        cameraId: camera._id,
        direction: 'IN',
        occurredAt: now,
        confidence: 0.95,
      });
    }
    for (let i = 0; i < 2; i++) {
      const evtId = `evt_p5_out_${i}_${Date.now()}`;
      await FootfallEventModel.create({
        eventId: evtId,
        shopId: shop._id,
        cameraId: camera._id,
        direction: 'OUT',
        occurredAt: now,
        confidence: 0.94,
      });
    }

    // 3. Test Footfall Summary Endpoint
    console.log('\n3. Testing GET /shops/:shopId/footfall/summary...');
    const summaryRes = await fetch(`${baseUrl}/shops/${shopId}/footfall/summary`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const summaryData = await summaryRes.json();
    console.log(`Summary Status: ${summaryRes.status}, Entries: ${summaryData.data?.entries}, Exits: ${summaryData.data?.exits}, Occupancy: ${summaryData.data?.estimatedOccupancy}`);
    if (summaryData.data?.entries < 5 || summaryData.data?.exits < 2) {
      throw new Error('Summary count did not match expected ingested events');
    }
    console.log(`DataSource: ${summaryData.data?.dataSource}, Quality: ${summaryData.data?.quality}`);
    console.log('✅ Footfall summary calculation verified');

    // 4. Test 24-Hour Timeseries Endpoint
    console.log('\n4. Testing GET /shops/:shopId/footfall/timeseries...');
    const tsRes = await fetch(`${baseUrl}/shops/${shopId}/footfall/timeseries`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const tsData = await tsRes.json();
    console.log(`Timeseries Status: ${tsRes.status}, Points Count: ${tsData.data?.points?.length}`);
    if (tsData.data?.points?.length !== 24) {
      throw new Error(`Expected 24 hourly points, got ${tsData.data?.points?.length}`);
    }
    console.log('✅ 24-Hour hourly chart points verified');

    // 5. Test Occupancy Baseline Drift Correction
    console.log('\n5. Testing POST /shops/:shopId/footfall/occupancy-baseline...');
    const prevOccupancy = summaryData.data?.estimatedOccupancy;
    const baselineRes = await fetch(`${baseUrl}/shops/${shopId}/footfall/occupancy-baseline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        baseline: 10,
        reason: 'Manual adjustment due to camera occlusion during morning rush',
      }),
    });
    const baselineData = await baselineRes.json();
    console.log(`Baseline Status: ${baselineRes.status}, New Baseline: ${baselineData.data?.occupancyBaseline}, New Occupancy: ${baselineData.data?.estimatedOccupancy}`);
    if (baselineData.data?.occupancyBaseline !== 10 || baselineData.data?.estimatedOccupancy !== prevOccupancy + 10) {
      throw new Error('Baseline correction calculation mismatch');
    }

    const baselineAudit = await AuditLogModel.findOne({ action: 'UPDATE_OCCUPANCY_BASELINE', 'target.id': shopId });
    if (!baselineAudit) throw new Error('Baseline reset audit log was not recorded');
    console.log('✅ Baseline drift reset and audit log verified');

    // 6. Test CSV Export
    console.log('\n6. Testing GET /shops/:shopId/footfall/export.csv...');
    const csvRes = await fetch(`${baseUrl}/shops/${shopId}/footfall/export.csv`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const csvText = await csvRes.text();
    const contentType = csvRes.headers.get('content-type');
    console.log(`CSV Status: ${csvRes.status}, Content-Type: ${contentType}`);
    if (!contentType?.includes('text/csv') || !csvText.includes('Hour,Bucket Start (UTC),Entries (IN)')) {
      throw new Error('Invalid CSV export payload');
    }
    console.log('✅ CSV Export verified');

    // 7. Test Admin Endpoints
    console.log('\n7. Testing Super Admin Endpoints...');

    // 7a. Overview
    const adminOverviewRes = await fetch(`${baseUrl}/admin/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminOverview = await adminOverviewRes.json();
    console.log(`Admin Overview: TotalShops=${adminOverview.data?.totalShops}, TotalCameras=${adminOverview.data?.totalCameras}, TotalEntries=${adminOverview.data?.totalEntriesToday}`);
    if (!adminOverview.success) throw new Error('Admin overview failed');

    // 7b. Status Toggle Validation (Reason is mandatory)
    console.log('\n8. Testing Admin Shop Suspend (Mandatory Reason Validation)...');
    const noReasonRes = await fetch(`${baseUrl}/admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'SUSPENDED', reason: '' }), // Empty reason!
    });
    if (noReasonRes.status !== 400) {
      throw new Error('Expected 400 when reason is missing for shop suspension');
    }
    console.log('✅ Mandatory reason validation enforced');

    // 7c. Suspend with valid reason
    const suspendRes = await fetch(`${baseUrl}/admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'SUSPENDED',
        reason: 'Routine compliance audit required',
      }),
    });
    const suspendData = await suspendRes.json();
    console.log(`Shop Suspended Status: ${suspendData.data?.status}`);
    if (suspendData.data?.status !== 'SUSPENDED') throw new Error('Shop status was not updated to SUSPENDED');

    // Re-activate
    await fetch(`${baseUrl}/admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        reason: 'Compliance audit cleared',
      }),
    });

    // 7d. Audit logs
    const auditRes = await fetch(`${baseUrl}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditData = await auditRes.json();
    console.log(`Audit Logs Count: ${auditData.data?.total}, Page: ${auditData.data?.page}`);
    if (!auditData.data?.items?.length) throw new Error('Audit logs list empty');
    console.log('✅ Admin shop management and audit logging fully verified');

    // 8. Test Role Guard: Owner accessing Admin Route (Must be 403)
    console.log('\n9. 🛡️  Testing Role Guard: Shop Owner accessing /admin/overview...');
    const forbiddenRes = await fetch(`${baseUrl}/admin/overview`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    console.log(`Forbidden Status: ${forbiddenRes.status}`);
    if (forbiddenRes.status !== 403) {
      throw new Error(`Expected 403 FORBIDDEN for owner accessing admin route, got ${forbiddenRes.status}`);
    }
    console.log('✅ Role-Based Access Control successfully protected admin routes');

    console.log('\n🎉 ✅ ALL PHASE 5 TESTS PASSED PERFECTLY!\n');
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runPhase5Verification();
