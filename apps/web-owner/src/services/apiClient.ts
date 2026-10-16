import {
  ApiResponse,
  ApiError,
  User,
  AuthResponse,
  Shop,
  Camera,
  CameraStatus,
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
const USE_MOCK_FALLBACK = (import.meta as any).env?.VITE_USE_MOCK_FALLBACK === 'true';

class ApiClient {
  private token: string | null = null;
  private forceMock: boolean = false;
  private memoryStore: Map<string, string> = new Map();
  private onUnauthorizedCallback: (() => void) | null = null;

  public setOnUnauthorized(cb: (() => void) | null) {
    this.onUnauthorizedCallback = cb;
  }

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
    const forceMockEnv = (import.meta as any).env?.VITE_FORCE_MOCK;
    if (forceMockEnv === 'false') {
      this.forceMock = false;
      this.setItem('dbi_force_mock', 'false');
    } else if (forceMockEnv === 'true') {
      this.forceMock = true;
      this.setItem('dbi_force_mock', 'true');
    } else {
      this.forceMock = this.getItem('dbi_force_mock') === 'true';
    }
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      this.setItem('dbi_token', token);
    } else {
      this.removeItem('dbi_token');
      this.removeItem('dbi_mock_user');
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

    const isCsv = endpoint.includes('/export.csv');
    const headers: Record<string, string> = {
      ...(isCsv ? { Accept: 'text/csv' } : { 'Content-Type': 'application/json' }),
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
      if (isCsv) {
        if (!response.ok) {
          const httpErr = new Error(`Failed to download CSV: ${response.statusText} (${response.status})`);
          (httpErr as any).isHttpError = true;
          (httpErr as any).status = response.status;
          throw httpErr;
        }
        const text = await response.text();
        return text as unknown as T;
      }

      let json: any;
      try {
        json = await response.json();
      } catch {
        // If server returned non-JSON on a 5xx response (e.g. Vite dev proxy ECONNREFUSED 500/502/504 when backend is not running)
        // and mock fallback is allowed, allow fallback to mockHandler
        if (USE_MOCK_FALLBACK && response.status >= 500) {
          throw new Error(`Proxy/Gateway unreachable (${response.status})`);
        }
        const parseErr = new Error(`Invalid JSON response from server (${response.status})`);
        (parseErr as any).isHttpError = true;
        (parseErr as any).status = response.status;
        throw parseErr;
      }

      if (!response.ok || !json.success) {
        const error = (json as ApiError).error || {
          code: response.status === 401 ? 'UNAUTHORIZED' : response.status === 403 ? 'FORBIDDEN' : 'SERVER_ERROR',
          message: response.statusText || 'Unknown error occurred'
        };
        const httpErr = new Error(`[${error.code}] ${error.message}`);
        (httpErr as any).isHttpError = true;
        (httpErr as any).status = response.status;
        throw httpErr;
      }

      return (json as ApiResponse<T>).data;
    } catch (err: any) {
      if (err.isHttpError) {
        if (err.status === 401) {
          this.setToken(null);
          this.onUnauthorizedCallback?.();
        }
        throw err;
      }
      // If backend is not available (network failure, fetch TypeError, or dev proxy 500 ECONNREFUSED), fallback to mock
      if (USE_MOCK_FALLBACK) {
        this.setForceMock(true);
        // eslint-disable-next-line no-console
        console.warn(`[ApiClient] Live API request to ${endpoint} failed (${err.message}), switched to mock mode.`);
        return this.mockHandler<T>(endpoint, options);
      }
      throw err;
    }
  }

  // --- Auth APIs ---
  public async register(name: string, email: string, password: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    if (res && res.token) {
      this.setToken(res.token);
    }
    return res;
  }

  public async login(email: string, password: string): Promise<AuthResponse> {
    const res = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res && res.token) {
      this.setToken(res.token);
    }
    return res;
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
    const payload = {
      ...input,
      streamUrl: (input as any).streamUrl || input.rtspUrl
    };
    return this.request<Camera>(`/shops/${shopId}/cameras`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  public async updateCamera(shopId: string, cameraId: string, input: Partial<CreateCameraInput>): Promise<Camera> {
    const payload = {
      ...input,
      streamUrl: (input as any).streamUrl || input.rtspUrl
    };
    return this.request<Camera>(`/shops/${shopId}/cameras/${cameraId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  public async testCamera(cameraId: string): Promise<CameraTestResult> {
    const res = await this.request<any>(`/cameras/${cameraId}/test`, {
      method: 'POST'
    });
    return {
      ...res,
      isReachable: res.isReachable !== undefined ? res.isReachable : res.accessible,
      accessible: res.accessible !== undefined ? res.accessible : res.isReachable
    };
  }

  // --- Counting Line APIs ---
  public async getCountingLine(cameraId: string): Promise<CountingLine | null> {
    try {
      const res = await this.request<CountingLine | null>(`/cameras/${cameraId}/counting-line`);
      return res;
    } catch (err: any) {
      if (err.status === 404 || err.message?.includes('NOT_FOUND') || err.message?.includes('404')) {
        return null;
      }
      throw err;
    }
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
    const res = await this.request<any>(`/shops/${shopId}/footfall/timeseries${query}`);
    return Array.isArray(res) ? res : (res?.points || []);
  }

  public async exportFootfallCsv(shopId: string, date?: string): Promise<string> {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.request<string>(`/shops/${shopId}/footfall/export.csv${query}`);
  }

  public async resetOccupancy(shopId: string, input: ResetOccupancyInput): Promise<{ success: boolean; estimatedOccupancy: number }> {
    const res = await this.request<any>(`/shops/${shopId}/footfall/occupancy-baseline`, {
      method: 'POST',
      body: JSON.stringify({
        baseline: input.newOccupancy,
        newOccupancy: input.newOccupancy,
        reason: input.reason
      })
    });
    return {
      success: true,
      estimatedOccupancy: res?.estimatedOccupancy ?? input.newOccupancy
    };
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

    // Current user resolution
    const token = this.getToken();
    let currentUser: User | null = null;
    const storedUserJson = this.getItem('dbi_mock_user');
    if (storedUserJson) {
      try {
        currentUser = JSON.parse(storedUserJson);
      } catch {
        currentUser = null;
      }
    } else if (token) {
      currentUser = {
        id: 'usr_owner_1',
        name: 'Alex Retailer',
        email: 'alex@store.com',
        role: 'SHOP_OWNER',
        status: 'ACTIVE'
      };
    }

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

    // Helper: Enforce tenant isolation by verifying current user owns the shop
    const verifyShopOwnership = (shopId: string): Shop => {
      const found = shops.find(s => s.id === shopId);
      if (!found) {
        const err = new Error(`[NOT_FOUND] Shop ${shopId} not found`);
        (err as any).isHttpError = true;
        (err as any).status = 404;
        throw err;
      }
      if (currentUser && found.ownerUserId !== currentUser.id) {
        const err = new Error(`[FORBIDDEN] Access denied: You do not have permission to view or modify this shop`);
        (err as any).isHttpError = true;
        (err as any).status = 403;
        throw err;
      }
      return found;
    };

    // 1. /auth/register
    if (endpoint === '/auth/register' && method === 'POST') {
      const user: User = {
        id: 'usr_' + Math.random().toString(36).substring(2, 8),
        name: body.name || 'Store Owner',
        email: body.email,
        role: 'SHOP_OWNER',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };
      const token = 'mock_jwt_token_' + user.id;
      this.setToken(token);
      this.setItem('dbi_mock_user', JSON.stringify(user));
      return { user, token };
    }

    // 2. /auth/login
    if (endpoint === '/auth/login' && method === 'POST') {
      const isKnownOwner2 = body.email === 'owner2@other.com';
      const user: User = {
        id: isKnownOwner2 ? 'usr_owner_2' : 'usr_owner_1',
        name: body.name || body.email?.split('@')[0] || 'Demo Owner',
        email: body.email,
        role: 'SHOP_OWNER',
        status: 'ACTIVE',
        createdAt: new Date().toISOString()
      };
      const token = 'mock_jwt_token_' + user.id;
      this.setToken(token);
      this.setItem('dbi_mock_user', JSON.stringify(user));
      return { user, token };
    }

    // 3. /auth/me
    if (endpoint === '/auth/me') {
      if (!this.token || !currentUser) {
        const err = new Error('[UNAUTHORIZED] No active session found');
        (err as any).isHttpError = true;
        (err as any).status = 401;
        throw err;
      }
      return currentUser;
    }

    // 4. /shops (GET & POST)
    if (endpoint === '/shops' && method === 'GET') {
      if (!this.token || !currentUser) {
        const err = new Error('[UNAUTHORIZED] Unauthorized access to stores');
        (err as any).isHttpError = true;
        (err as any).status = 401;
        throw err;
      }
      // Tenant Isolation: Only return shops owned by the authenticated owner
      return shops.filter(s => s.ownerUserId === currentUser!.id);
    }

    if (endpoint === '/shops' && method === 'POST') {
      if (!this.token || !currentUser) {
        const err = new Error('[UNAUTHORIZED] Unauthorized to create store');
        (err as any).isHttpError = true;
        (err as any).status = 401;
        throw err;
      }
      if (!body.name || !body.name.trim()) {
        const err = new Error('[VALIDATION_ERROR] Store name is required');
        (err as any).isHttpError = true;
        (err as any).status = 400;
        throw err;
      }
      const newShop: Shop = {
        id: 'shop_' + Math.random().toString(36).substring(2, 8),
        ownerUserId: currentUser.id,
        name: body.name.trim(),
        timezone: body.timezone || 'Asia/Kolkata',
        status: 'ACTIVE',
        occupancyBaseline: Math.max(0, Number(body.occupancyBaseline) || 0),
        createdAt: new Date().toISOString()
      };
      shops.push(newShop);
      this.setItem('dbi_mock_shops', JSON.stringify(shops));
      return newShop;
    }

    // 5. /shops/:shopId (GET & PATCH)
    const shopMatch = endpoint.match(/^\/shops\/([^/?]+)(?:\?.*)?$/);
    if (shopMatch) {
      const shopId = shopMatch[1];
      const found = verifyShopOwnership(shopId);

      if (method === 'PATCH') {
        if (body.name) found.name = body.name.trim();
        if (body.timezone) found.timezone = body.timezone;
        if (body.occupancyBaseline !== undefined) {
          found.occupancyBaseline = Math.max(0, Number(body.occupancyBaseline) || 0);
        }
        found.updatedAt = new Date().toISOString();
        this.setItem('dbi_mock_shops', JSON.stringify(shops));
      }
      return found;
    }

    // 6. /shops/:shopId/cameras (GET & POST)
    const shopCamerasMatch = endpoint.match(/^\/shops\/([^/?]+)\/cameras(?:\?.*)?$/);
    if (shopCamerasMatch) {
      const shopId = shopCamerasMatch[1];
      verifyShopOwnership(shopId);

      if (method === 'GET') {
        return cameras.filter(c => c.shopId === shopId);
      }
      if (method === 'POST') {
        const newCam: Camera = {
          id: 'cam_' + Math.random().toString(36).substring(2, 8),
          shopId,
          name: body.name?.trim() || 'Entrance Camera',
          connectionType: body.connectionType || 'RTSP',
          status: body.connectionType === 'MOCK_STREAM' ? 'DEGRADED' : 'CONNECTING',
          lastHeartbeatAt: new Date().toISOString(),
          safeErrorCode: body.connectionType === 'MOCK_STREAM' ? 'DEMO_CLIP_ACTIVE' : null,
          rtspUrlMasked: maskRtspUrl(body.rtspUrl || 'rtsp://mock-camera/live'),
          createdAt: new Date().toISOString()
        };
        cameras.push(newCam);
        this.setItem('dbi_mock_cameras', JSON.stringify(cameras));
        return newCam;
      }
    }

    // 7. /shops/:shopId/cameras/:cameraId or /cameras/:cameraId (PATCH - Edit Camera)
    const patchCamMatch = endpoint.match(/^(?:\/shops\/([^/?]+))?\/cameras\/([^/?]+)(?:\?.*)?$/);
    if (patchCamMatch && method === 'PATCH') {
      const shopId = patchCamMatch[1];
      const cameraId = patchCamMatch[2];
      const cam = cameras.find(c => c.id === cameraId);
      if (!cam) {
        const err = new Error(`[NOT_FOUND] Camera ${cameraId} not found`);
        (err as any).isHttpError = true;
        (err as any).status = 404;
        throw err;
      }
      if (shopId) {
        verifyShopOwnership(shopId);
      } else {
        verifyShopOwnership(cam.shopId);
      }

      if (body.name) cam.name = body.name.trim();
      if (body.connectionType) {
        cam.connectionType = body.connectionType;
        if (body.connectionType === 'MOCK_STREAM') {
          cam.status = 'DEGRADED';
          cam.safeErrorCode = 'DEMO_CLIP_ACTIVE';
        }
      }
      if (body.rtspUrl && !body.rtspUrl.includes('****')) {
        cam.rtspUrlMasked = maskRtspUrl(body.rtspUrl);
      }
      cam.updatedAt = new Date().toISOString();
      this.setItem('dbi_mock_cameras', JSON.stringify(cameras));
      return cam;
    }

    // 8. /cameras/:cameraId/test (POST)
    const camTestMatch = endpoint.match(/^\/cameras\/([^/?]+)\/test(?:\?.*)?$/);
    if (camTestMatch && method === 'POST') {
      const cameraId = camTestMatch[1];
      const cam = cameras.find(c => c.id === cameraId);
      if (cam) {
        verifyShopOwnership(cam.shopId);
      }
      const isMockStream = cam?.connectionType === 'MOCK_STREAM';
      const isReachable = true;
      // Per spec: if real camera or AI worker unavailable, label DEMO/DEGRADED; never falsely display LIVE
      const status: CameraStatus = isMockStream ? 'DEGRADED' : 'ONLINE';
      if (cam) {
        cam.status = status;
        cam.lastHeartbeatAt = new Date().toISOString();
        cam.safeErrorCode = isMockStream ? 'DEMO_CLIP_ACTIVE' : null;
        this.setItem('dbi_mock_cameras', JSON.stringify(cameras));
      }
      return {
        cameraId,
        status,
        isReachable,
        safeErrorCode: isMockStream ? 'DEMO_CLIP_ACTIVE' : null,
        message: isMockStream
          ? 'DEMO test clip stream verified (synthetic test frames)'
          : 'RTSP handshake and frame grab verified successfully',
        testedAt: new Date().toISOString()
      };
    }

    // 9. /cameras/:cameraId/counting-line (GET & PUT)
    const lineMatch = endpoint.match(/^\/cameras\/([^/?]+)\/counting-line(?:\?.*)?$/);
    if (lineMatch) {
      const cameraId = lineMatch[1];
      const cam = cameras.find(c => c.id === cameraId);
      if (cam) {
        verifyShopOwnership(cam.shopId);
      }
      if (method === 'GET') {
        return lines[cameraId] || null;
      }
      if (method === 'PUT') {
        const updatedLine: CountingLine = {
          id: lines[cameraId]?.id || 'line_' + Math.random().toString(36).substring(2, 8),
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

    // 10. /shops/:shopId/footfall/summary
    const summaryMatch = endpoint.match(/^\/shops\/([^/?]+)\/footfall\/summary/);
    if (summaryMatch) {
      const shopId = summaryMatch[1];
      const shop = verifyShopOwnership(shopId);
      const baseline = baselineOverrides[shopId] ?? (shop.occupancyBaseline || 0);
      const entries = 248;
      const exits = 184;
      // Counting formula: baseline + entries - exits
      const estimatedOccupancy = Math.max(0, baseline + entries - exits);

      return {
        shopId,
        date: new Date().toISOString().split('T')[0],
        entries,
        exits,
        estimatedOccupancy,
        occupancyBaseline: baseline,
        dataSource: 'DEMO', // As mandated: DEMO label if no live video pipeline
        quality: 'OK'
      } as FootfallSummary;
    }

    // 11. /shops/:shopId/footfall/timeseries
    const timeseriesMatch = endpoint.match(/^\/shops\/([^/?]+)\/footfall\/timeseries/);
    if (timeseriesMatch) {
      const shopId = timeseriesMatch[1];
      verifyShopOwnership(shopId);

      const urlParams = new URLSearchParams(endpoint.split('?')[1] || '');
      const queryDate = urlParams.get('date') || new Date().toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      // If querying another date with no events recorded, return empty array
      if (queryDate !== today && queryDate !== '2026-10-15') {
        return [];
      }

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
          bucketStartUtc: `${queryDate}T${item.h}:00Z`,
          bucketType: 'HOUR',
          entries: item.in,
          exits: item.out,
          estimatedOccupancy: Math.max(0, runningOcc)
        };
      });
    }

    // 12. /shops/:shopId/footfall/export.csv
    const csvMatch = endpoint.match(/^\/shops\/([^/?]+)\/footfall\/export\.csv/);
    if (csvMatch) {
      const shopId = csvMatch[1];
      verifyShopOwnership(shopId);

      const urlParams = new URLSearchParams(endpoint.split('?')[1] || '');
      const exportDate = urlParams.get('date') || new Date().toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      if (exportDate !== today && exportDate !== '2026-10-15') {
        // Return CSV header with 0 rows for empty results
        return `Date,Hour,Entries,Exits,EstimatedOccupancy,Quality,DataSource\n`;
      }

      return `Date,Hour,Entries,Exits,EstimatedOccupancy,Quality,DataSource\n` +
        `${exportDate},08:00,12,4,8,OK,DEMO\n` +
        `${exportDate},09:00,28,14,22,OK,DEMO\n` +
        `${exportDate},10:00,34,20,36,OK,DEMO\n` +
        `${exportDate},11:00,42,30,48,OK,DEMO\n` +
        `${exportDate},12:00,38,35,51,OK,DEMO\n` +
        `${exportDate},13:00,30,28,53,OK,DEMO\n` +
        `${exportDate},14:00,24,22,55,OK,DEMO\n` +
        `${exportDate},15:00,40,31,64,OK,DEMO\n`;
    }

    // 13. /shops/:shopId/footfall/occupancy-baseline
    const baselineMatch = endpoint.match(/^\/shops\/([^/?]+)\/footfall\/occupancy-baseline/);
    if (baselineMatch && method === 'POST') {
      const shopId = baselineMatch[1];
      verifyShopOwnership(shopId);
      const newOccupancy = Math.max(0, Number(body.newOccupancy ?? body.baseline ?? 0));
      baselineOverrides[shopId] = newOccupancy;
      this.setItem('dbi_mock_baselines', JSON.stringify(baselineOverrides));
      return { success: true, estimatedOccupancy: newOccupancy };
    }

    throw new Error(`Unhandled mock endpoint: ${method} ${endpoint}`);
  }
}

export const api = new ApiClient();
