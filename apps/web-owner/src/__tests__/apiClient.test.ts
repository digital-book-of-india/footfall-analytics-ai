import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../services/apiClient';

describe('ApiClient & Owner Contract Integration', () => {
  beforeEach(() => {
    localStorage.clear();
    api.setToken(null);
    api.setForceMock(true); // Test with mock contract adapter
  });

  it('authenticates owner with register and login', async () => {
    const regRes = await api.register('John Owner', 'john@retail.com', 'Pass123!');
    expect(regRes.user.email).toBe('john@retail.com');
    expect(regRes.user.role).toBe('SHOP_OWNER');
    expect(regRes.token).toBeDefined();

    const loginRes = await api.login('john@retail.com', 'Pass123!');
    expect(loginRes.user.email).toBe('john@retail.com');
    expect(api.getToken()).toBe(loginRes.token);
  });

  it('fetches shops list and creates new shop', async () => {
    const initialShops = await api.getShops();
    expect(Array.isArray(initialShops)).toBe(true);
    expect(initialShops.length).toBeGreaterThanOrEqual(1);

    const newShop = await api.createShop({
      name: 'Westside Boutique',
      timezone: 'America/New_York',
      occupancyBaseline: 3
    });

    expect(newShop.name).toBe('Westside Boutique');
    expect(newShop.timezone).toBe('America/New_York');
    expect(newShop.occupancyBaseline).toBe(3);

    const updatedShops = await api.getShops();
    expect(updatedShops.some(s => s.id === newShop.id)).toBe(true);
  });

  it('updates shop profile metadata', async () => {
    const shops = await api.getShops();
    const firstShop = shops[0];

    const updated = await api.updateShop(firstShop.id, {
      name: 'Downtown Supercenter',
      occupancyBaseline: 10
    });

    expect(updated.name).toBe('Downtown Supercenter');
    expect(updated.occupancyBaseline).toBe(10);
  });

  it('adds and lists entrance cameras with masked credentials', async () => {
    const shops = await api.getShops();
    const shopId = shops[0].id;

    const newCam = await api.createCamera(shopId, {
      name: 'North Glass Entrance',
      connectionType: 'RTSP',
      rtspUrl: 'rtsp://operator:secretKey99@192.168.1.150:554/h264'
    });

    expect(newCam.name).toBe('North Glass Entrance');
    // Secret handling check: password must be masked!
    expect(newCam.rtspUrlMasked).not.toContain('secretKey99');
    expect(newCam.rtspUrlMasked).toContain('****');

    const cameras = await api.getCameras(shopId);
    expect(cameras.some(c => c.id === newCam.id)).toBe(true);
  });

  it('runs camera stream test action and returns diagnosis', async () => {
    const shops = await api.getShops();
    const cameras = await api.getCameras(shops[0].id);
    const camera = cameras[0];

    const testRes = await api.testCamera(camera.id);
    expect(testRes.cameraId).toBe(camera.id);
    expect(testRes.isReachable).toBe(true);
    expect(testRes.status).toBe('ONLINE');
    expect(testRes.message).toBeDefined();
  });

  it('configures virtual counting line with normalized coordinates and directions', async () => {
    const shops = await api.getShops();
    const cameras = await api.getCameras(shops[0].id);
    const camera = cameras[0];

    const line = await api.updateCountingLine(camera.id, {
      coordinates: { x1: 0.1, y1: 0.6, x2: 0.9, y2: 0.6 },
      inDirection: 'IN',
      outDirection: 'OUT',
      enabled: true
    });

    expect(line.cameraId).toBe(camera.id);
    expect(line.coordinates.x1).toBe(0.1);
    expect(line.coordinates.x2).toBe(0.9);
    expect(line.inDirection).toBe('IN');
    expect(line.outDirection).toBe('OUT');
    expect(line.enabled).toBe(true);

    const fetchedLine = await api.getCountingLine(camera.id);
    expect(fetchedLine?.coordinates.y1).toBe(0.6);
  });

  it('fetches footfall summary with entries, exits and estimated occupancy', async () => {
    const shops = await api.getShops();
    const summary = await api.getFootfallSummary(shops[0].id);

    expect(summary.shopId).toBe(shops[0].id);
    expect(summary.entries).toBeGreaterThan(0);
    expect(summary.exits).toBeGreaterThan(0);
    expect(summary.estimatedOccupancy).toBeGreaterThanOrEqual(0);
    expect(['LIVE', 'DEMO']).toContain(summary.dataSource);
    expect(['OK', 'DEGRADED', 'INCOMPLETE', 'RESET_REQUIRED']).toContain(summary.quality);
  });

  it('fetches hourly footfall timeseries breakdown', async () => {
    const shops = await api.getShops();
    const timeseries = await api.getFootfallTimeseries(shops[0].id);

    expect(Array.isArray(timeseries)).toBe(true);
    expect(timeseries.length).toBeGreaterThan(0);
    const firstBucket = timeseries[0];
    expect(firstBucket.entries).toBeDefined();
    expect(firstBucket.exits).toBeDefined();
    expect(firstBucket.bucketStartUtc).toBeDefined();
  });

  it('exports footfall data to CSV format', async () => {
    const shops = await api.getShops();
    const csv = await api.exportFootfallCsv(shops[0].id);

    expect(typeof csv).toBe('string');
    expect(csv).toContain('Date,Hour,Entries,Exits,EstimatedOccupancy');
    expect(csv).toContain('08:00');
  });

  it('calibrates estimated occupancy via baseline endpoint', async () => {
    const shops = await api.getShops();
    const res = await api.resetOccupancy(shops[0].id, {
      newOccupancy: 42,
      reason: 'Physical store count audit'
    });

    expect(res.success).toBe(true);
    expect(res.estimatedOccupancy).toBe(42);

    const summary = await api.getFootfallSummary(shops[0].id);
    expect(summary.occupancyBaseline).toBe(42);
  });
});
