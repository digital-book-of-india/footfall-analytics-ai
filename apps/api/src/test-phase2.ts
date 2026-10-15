import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { ShopModel } from './models/Shop.js';
import http from 'http';

async function runPhase2Verification() {
  console.log('\n🧪 --- Starting Phase 2 Verification Test --- 🧪');
  await connectDatabase();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4001, () => resolve()));
  const baseUrl = 'http://localhost:4001/api/v1';

  try {
    // 1. Test Login as Owner 1
    console.log('\n1. Testing Login for Owner 1 (owner@demo.com)...');
    const owner1Res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner@demo.com', password: 'Password@123' }),
    });
    const owner1Data = await owner1Res.json();
    console.log(`Status: ${owner1Res.status}, Success: ${owner1Data.success}, RequestId: ${owner1Data.requestId}`);
    if (!owner1Data.success || !owner1Data.data?.token) throw new Error('Owner 1 login failed');
    const owner1Token = owner1Data.data.token;

    // 2. Test Login as Owner 2
    console.log('\n2. Testing Login for Owner 2 (other@demo.com)...');
    const owner2Res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'other@demo.com', password: 'Password@123' }),
    });
    const owner2Data = await owner2Res.json();
    if (!owner2Data.success) throw new Error('Owner 2 login failed');
    const owner2Token = owner2Data.data.token;

    // 3. Test GET /auth/me for Owner 1
    console.log('\n3. Testing GET /auth/me...');
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${owner1Token}` },
    });
    const meData = await meRes.json();
    console.log(`GET /auth/me -> ${meData.data.name} (${meData.data.role})`);
    if (meData.data.passwordHash) throw new Error('CRITICAL SECURITY LEAK: passwordHash present in safe user!');

    // 4. Fetch Shops
    const shop1 = await ShopModel.findOne({ name: 'DBI Flagship Retail Store' });
    const shop2 = await ShopModel.findOne({ name: 'Downtown Fashion Boutique' });
    if (!shop1 || !shop2) throw new Error('Seeded shops not found');

    // 5. Test Owner 1 accessing their own shop (Should pass)
    console.log(`\n4. Testing Owner 1 accessing Shop 1 (${shop1.name})...`);
    const shop1Res = await fetch(`${baseUrl}/shops/${shop1._id}`, {
      headers: { Authorization: `Bearer ${owner1Token}` },
    });
    const shop1Data = await shop1Res.json();
    console.log(`Status: ${shop1Res.status}, Allowed: ${shop1Data.success}`);
    if (shop1Res.status !== 200) throw new Error('Owner 1 should be able to access Shop 1');

    // 6. Test TENANT ISOLATION: Owner 1 attempting to access Shop 2 (MUST BE 403 TENANT_VIOLATION)
    console.log(`\n5. 🛡️  Testing TENANT ISOLATION: Owner 1 accessing Shop 2 (${shop2.name})...`);
    const tenantViolationRes = await fetch(`${baseUrl}/shops/${shop2._id}`, {
      headers: { Authorization: `Bearer ${owner1Token}` },
    });
    const tenantViolationData = await tenantViolationRes.json();
    console.log(`Status: ${tenantViolationRes.status}, Code: ${tenantViolationData.error?.code}`);
    if (tenantViolationRes.status !== 403 || tenantViolationData.error?.code !== 'TENANT_VIOLATION') {
      throw new Error(`CRITICAL SECURITY FAILURE: Expected 403 TENANT_VIOLATION, got ${tenantViolationRes.status}`);
    }
    console.log('✅ Tenant Isolation successfully prevented unauthorized cross-tenant access!');

    // 7. Test Super Admin login and access to Shop 2 (Should pass)
    console.log('\n6. Testing Super Admin accessing Shop 2...');
    const adminRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@dbi.ai', password: 'Password@123' }),
    });
    const adminData = await adminRes.json();
    const adminToken = adminData.data.token;

    const adminShopRes = await fetch(`${baseUrl}/shops/${shop2._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(`Admin Status: ${adminShopRes.status} (Allowed: ${adminShopRes.status === 200})`);
    if (adminShopRes.status !== 200) throw new Error('Super Admin should have cross-tenant access');

    console.log('\n🎉 ✅ ALL PHASE 2 TESTS PASSED PERFECTLY!\n');
  } finally {
    server.close();
    await disconnectDatabase();
  }
}

runPhase2Verification();
