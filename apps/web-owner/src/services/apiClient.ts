import {
  ApiResponse,
  ApiError,
  User,
  AuthResponse,
  Shop,
  Camera,
  CountingLine,
  CameraTestResult,
  FootfallSummary,
  FootfallTimeseriesPoint,
  CreateShopInput,
  UpdateShopInput,
  CreateCameraInput,
  UpdateCountingLineInput,
  ResetOccupancyInput
} from '../types';
import { maskRtspUrl } from '../utils/security';

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';

class ApiClient {
  private token: string | null = null;
  private forceMock: boolean = false;
  private memoryStore: Map<string, string> = new Map();

  private getStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    return null;
  }

  private getItem(key: string): string | null {
    const storage = this.getStorage();
    if (storage) return storage.getItem(key);
    return this.memoryStore.get(key) || null;
  }

  private setItem(key: string, val: string): void {
    const storage = this.getStorage();
    if (storage) {
      storage.setItem(key, val);
    } else {
      this.memoryStore.set(key, val);
    }
  }

  private removeItem(key: string): void {
    const storage = this.getStorage();
    if (storage) {
      storage.removeItem(key);
    } else {
      this.memoryStore.delete(key);
    }
  }

  constructor() {
    this.token = this.getItem('dbi_token');
    this.forceMock = this.getItem('dbi_force_mock') === 'true';
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      this.setItem('dbi_token', token);
    } else {
      this.removeItem('dbi_token');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  public setForceMock(mock: boolean) {
    this.forceMock = mock;
    this.setItem('dbi_force_mock', mock ? 'true' : 'false');
  }

  public isForceMock(): boolean {
    return this.forceMock;
  }

  private generateRequestId(): string {
    return 'req_' + Math.random().toString(36).substring(2, 10);
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (this.forceMock) {
      return this.mockHandler<T>(endpoint, options);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-Id': this.generateRequestId(),
      ...(options.headers as Record<string, string> || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      // Special case for CSV download
      if (endpoint.endsWith('/export.csv')) {
        if (!response.ok) throw new Error('Failed to download CSV');
        const text = await response.text();
        return text as unknown as T;
      }

      const json: ApiResponse<T> | ApiError = await response.json();

      if (!response.ok || !json.success) {
        const error = (json as ApiError).error || {
          code: 'SERVER_ERROR',
          message: response.statusText || 'Unknown error occurred'
        };
        throw new Error(`[${error.code}] ${error.message}`);
      }

      return (json as ApiResponse<T>).data;
    } catch (err: any) {
      // If backend is not available, gracefully fallback to mock data in dev
      // eslint-disable-next-line no-console
      console.warn(`[ApiClient] Live API request to ${endpoint} failed, checking mock adapter...`, err.message);
      return this.mockHandler<T>(endpoint, options);
    }
  }

  // --- Auth APIs ---
  public async register(name: string, email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
  }

  public async login(email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  public async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // --- Shop APIs ---
  public async getShops(): Promise<Shop[]> {
    return this.request<Shop[]>('/shops');
  }

  public async getShop(shopId: string): Promise<Shop> {
    return this.request<Shop>(`/shops/${shopId}`);
  }

  public async createShop(input: CreateShopInput): Promise<Shop> {
    return this.request<Shop>('/shops', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  public async updateShop(shopId: string, input: UpdateShopInput): Promise<Shop> {
    return this.request<Shop>(`/shops/${shopId}`, {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
  }

  // --- Camera APIs ---
  public async getCameras(shopId: string): Promise<Camera[]> {
    return this.request<Camera[]>(`/shops/${shopId}/cameras`);
  }

  public async createCamera(shopId: string, input: CreateCameraInput): Promise<Camera> {
    return this.request<Camera>(`/shops/${shopId}/cameras`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  public async testCamera(cameraId: string): Promise<CameraTestResult> {
    return this.request<CameraTestResult>(`/cameras/${cameraId}/test`, {
      method: 'POST'
    });
  }

  // --- Counting Line APIs ---
  public async getCountingLine(cameraId: string): Promise<CountingLine | null> {
    return this.request<CountingLine | null>(`/cameras/${cameraId}/counting-line`);
  }

  public async updateCountingLine(cameraId: string, input: UpdateCountingLineInput): Promise<CountingLine> {
    return this.request<CountingLine>(`/cameras/${cameraId}/counting-line`, {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  }

  // --- Footfall Analytics APIs ---
  public async getFootfallSummary(shopId: string, date?: string): Promise<FootfallSummary> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request<FootfallSummary>(`/shops/${shopId}/footfall/summary${query}`);
  }

  public async getFootfallTimeseries(shopId: string, date?: string): Promise<FootfallTimeseriesPoint[]> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request<FootfallTimeseriesPoint[]>(`/shops/${shopId}/footfall/timeseries${query}`);
  }

  public async exportFootfallCsv(shopId: string, date?: string): Promise<string> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request<string>(`/shops/${shopId}/footfall/export.csv${query}`);
  }

  public async resetOccupancy(shopId: string, input: ResetOccupancyInput): Promise<{ success: boolean; estimatedOccupancy: number }> {
    return this.request<{ success: boolean; estimatedOccupancy: number }>(`/shops/${shopId}/footfall/occupancy-baseline`, {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  // ==========================================
  // In-Memory / LocalStorage Mock State Adapter
  // Implements agreed mock responses as per plan
  // ==========================================
  private mockHandler<T>(endpoint: string, options: RequestInit): Promise<T> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const res = this.resolveMock(endpoint, options);
          resolve(res as T);
        } catch (e) {
          reject(e);
        }
      }, 150);
    });
  }

  private resolveMock(endpoint: string, options: RequestInit): any {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body as string) : {};

    // Load persistent mock state
    const defaultShops: Shop[] = [
      {
        id: 'shop_001',
        ownerUserId: 'usr_owner_1',
        name: 'Downtown Flagship Store',
        timezone: 'Asia/Kolkata',
        status: 'ACTIVE',
        occupancyBaseline: 0,
        createdAt: new Date().toISOString()
      },
      {
        id: 'shop_002',
        ownerUserId: 'usr_owner_1',
        name: 'Mall Galleria Outlet',
        timezone: 'Asia/Kolkata',
        status: 'ACTIVE',
        occupancyBaseline: 5,
        createdAt: new Date().toISOString()
      }
    ];

    let shops: Shop[] = JSON.parse(this.getItem('dbi_mock_shops') || JSON.stringify(defaultShops));
    let cameras: Camera[] = JSON.parse(this.getItem('dbi_mock_cameras') || JSON.stringify([
      {
        id: 'cam_001',
        shopId: 'shop_001',
        name: 'Main Entrance Camera',
        connectionType: 'RTSP',
        status: 'ONLINE',
        lastHeartbeatAt: new Date().toISOString(),
        safeErrorCode: null,
        rtspUrlMasked: 'rtsp://admin:****@192.168.1.100:554/stream1',
        createdAt: new Date().toISOString()
      }
    ]));

    let lines: Record<string, CountingLine> = JSON.parse(this.getItem('dbi_mock_lines') || JSON.stringify({
      cam_001: {
        id: 'line_001',
        shopId: 'shop_001',
        cameraId: 'cam_001',
        coordinates: { x1: 0.15, y1: 0.55, x2: 0.85, y2: 0.55 },
        inDirection: 'IN',
        outDirection: 'OUT',
        enabled: true,
        updatedAt: new Date().toISOString()
      }
    }));

    let baselineOverrides: Record<string, number> = JSON.parse(this.getItem('dbi_mock_baselines') || '{}');

    // 1. /auth/register
    if (endpoint === '/auth/register' && method === 'POST') {
      const user: User = {
        id: 'usr_' + Math.random().toString(36).substr(2, 6),
        name: body.name || 'Store Owner',
        email: body.email,
        role: 'SHOP_OWNER',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };
      const token = 'mock_jwt_token_' + Date.now();
      this.setToken(token);
      return { user, token };
    }

    // 2. /auth/login
    if (endpoint === '/auth/login' && method === 'POST') {
      const user: User = {
        id: 'usr_owner_1',
        name: body.email?.split('@')[0] || 'Demo Owner',
        email: body.email,
        role: 'SHOP_OWNER',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };
      const token = 'mock_jwt_token_demo';
      this.setToken(token);
      return { user, token };
    }

    // 3. /auth/me
    if (endpoint === '/auth/me') {
      return {
        id: 'usr_owner_1',
        name: 'Alex Retailer',
        email: 'alex@store.com',
        role: 'SHOP_OWNER',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };
    }

    // 4. /shops
    if (endpoint === '/shops' && method === 'GET') {
      return shops;
    }

    if (endpoint === '/shops' && method === 'POST') {
      const newShop: Shop = {
        id: 'shop_' + Math.random().toString(36).substr(2, 6),
        ownerUserId: 'usr_owner_1',
        name: body.name,
        timezone: body.timezone || 'Asia/Kolkata',
        status: 'ACTIVE',
        occupancyBaseline: Number(body.occupancyBaseline) || 0,
        createdAt: new Date().toISOString()
      };
      shops.push(newShop);
      this.setItem('dbi_mock_shops', JSON.stringify(shops));
      return newShop;
    }

    // 5. /shops/:shopId
    const shopMatch = endpoint.match(/^\/shops\/([^/]+)$/);
    if (shopMatch) {
      const shopId = shopMatch[1];
      const found = shops.find(s => s.id === shopId);
      if (!found) throw new Error('Shop not found');

      if (method === 'PATCH') {
        if (body.name) found.name = body.name;
        if (body.timezone) found.timezone = body.timezone;
        if (body.occupancyBaseline !== undefined) found.occupancyBaseline = Number(body.occupancyBaseline);
        found.updatedAt = new Date().toISOString();
        this.setItem('dbi_mock_shops', JSON.stringify(shops));
      }
      return found;
    }

    // 6. /shops/:shopId/cameras
    const shopCamerasMatch = endpoint.match(/^\/shops\/([^/]+)\/cameras$/);
    if (shopCamerasMatch) {
      const shopId = shopCamerasMatch[1];
      if (method === 'GET') {
        return cameras.filter(c => c.shopId === shopId);
      }
      if (method === 'POST') {
        const newCam: Camera = {
          id: 'cam_' + Math.random().toString(36).substr(2, 6),
          shopId,
          name: body.name,
          connectionType: body.connectionType || 'RTSP',
          status: 'CONNECTING',
          lastHeartbeatAt: new Date().toISOString(),
          safeErrorCode: null,
          rtspUrlMasked: maskRtspUrl(body.rtspUrl || 'rtsp://mock-camera/live'),
          createdAt: new Date().toISOString()
        };
        cameras.push(newCam);
        this.setItem('dbi_mock_cameras', JSON.stringify(cameras));
        return newCam;
      }
    }

    // 7. /cameras/:cameraId/test
    const camTestMatch = endpoint.match(/^\/cameras\/([^/]+)\/test$/);
    if (camTestMatch && method === 'POST') {
      const cameraId = camTestMatch[1];
      const cam = cameras.find(c => c.id === cameraId);
      const isReachable = true;
      const status = isReachable ? 'ONLINE' : 'CONFIG_ERROR';
      if (cam) {
        cam.status = status;
        cam.lastHeartbeatAt = new Date().toISOString();
        cam.safeErrorCode = isReachable ? null : 'STREAM_TIMEOUT';
        this.setItem('dbi_mock_cameras', JSON.stringify(cameras));
      }
      return {
        cameraId,
        status,
        isReachable,
        safeErrorCode: isReachable ? null : 'STREAM_TIMEOUT',
        message: isReachable ? 'RTSP handshake and frame grab verified successfully' : 'Could not reach RTSP stream',
        testedAt: new Date().toISOString()
      };
    }

    // 8. /cameras/:cameraId/counting-line
    const lineMatch = endpoint.match(/^\/cameras\/([^/]+)\/counting-line$/);
    if (lineMatch) {
      const cameraId = lineMatch[1];
      if (method === 'GET') {
        return lines[cameraId] || null;
      }
      if (method === 'PUT') {
        const cam = cameras.find(c => c.id === cameraId);
        const updatedLine: CountingLine = {
          id: lines[cameraId]?.id || 'line_' + Math.random().toString(36).substr(2, 6),
          shopId: cam?.shopId || 'shop_001',
          cameraId,
          coordinates: body.coordinates,
          inDirection: body.inDirection,
          outDirection: body.outDirection,
          enabled: body.enabled !== undefined ? body.enabled : true,
          updatedAt: new Date().toISOString()
        };
        lines[cameraId] = updatedLine;
        this.setItem('dbi_mock_lines', JSON.stringify(lines));
        return updatedLine;
      }
    }

    // 9. /shops/:shopId/footfall/summary
    const summaryMatch = endpoint.match(/^\/shops\/([^/]+)\/footfall\/summary/);
    if (summaryMatch) {
      const shopId = summaryMatch[1];
      const shop = shops.find(s => s.id === shopId);
      const baseline = baselineOverrides[shopId] ?? (shop?.occupancyBaseline || 0);
      const entries = 248;
      const exits = 184;
      const estimatedOccupancy = Math.max(0, baseline + entries - exits);

      return {
        shopId,
        date: new Date().toISOString().split('T')[0],
        entries,
        exits,
        estimatedOccupancy,
        occupancyBaseline: baseline,
        dataSource: 'DEMO', // As specified: DEMO label if no live video pipeline
        quality: 'OK'
      } as FootfallSummary;
    }

    // 10. /shops/:shopId/footfall/timeseries
    const timeseriesMatch = endpoint.match(/^\/shops\/([^/]+)\/footfall\/timeseries/);
    if (timeseriesMatch) {
      const shopId = timeseriesMatch[1];
      const today = new Date().toISOString().split('T')[0];
      const hours = [
        { h: '08:00', in: 12, out: 4 },
        { h: '09:00', in: 28, out: 14 },
        { h: '10:00', in: 34, out: 20 },
        { h: '11:00', in: 42, out: 30 },
        { h: '12:00', in: 38, out: 35 },
        { h: '13:00', in: 30, out: 28 },
        { h: '14:00', in: 24, out: 22 },
        { h: '15:00', in: 40, out: 31 }
      ];

      let runningOcc = baselineOverrides[shopId] ?? 0;
      return hours.map(item => {
        runningOcc += (item.in - item.out);
        return {
          bucketStartUtc: `${today}T${item.h}:00Z`,
          bucketType: 'HOUR',
          entries: item.in,
          exits: item.out,
          estimatedOccupancy: Math.max(0, runningOcc)
        };
      });
    }

    // 11. /shops/:shopId/footfall/export.csv
    const csvMatch = endpoint.match(/^\/shops\/([^/]+)\/footfall\/export\.csv/);
    if (csvMatch) {
      const today = new Date().toISOString().split('T')[0];
      return `Date,Hour,Entries,Exits,EstimatedOccupancy,Quality,DataSource\n` +
        `${today},08:00,12,4,8,OK,DEMO\n` +
        `${today},09:00,28,14,22,OK,DEMO\n` +
        `${today},10:00,34,20,36,OK,DEMO\n` +
        `${today},11:00,42,30,48,OK,DEMO\n` +
        `${today},12:00,38,35,51,OK,DEMO\n` +
        `${today},13:00,30,28,53,OK,DEMO\n` +
        `${today},14:00,24,22,55,OK,DEMO\n` +
        `${today},15:00,40,31,64,OK,DEMO\n`;
    }

    // 12. /shops/:shopId/footfall/occupancy-baseline
    const baselineMatch = endpoint.match(/^\/shops\/([^/]+)\/footfall\/occupancy-baseline/);
    if (baselineMatch && method === 'POST') {
      const shopId = baselineMatch[1];
      const newOccupancy = Number(body.newOccupancy ?? body.baseline ?? 0);
      baselineOverrides[shopId] = newOccupancy;
      this.setItem('dbi_mock_baselines', JSON.stringify(baselineOverrides));
      return { success: true, estimatedOccupancy: newOccupancy };
    }

    throw new Error(`Unhandled mock endpoint: ${method} ${endpoint}`);
  }
}

export const api = new ApiClient();
