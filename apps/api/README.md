# 🏛️ DBI Intelligence — Core Backend API (`@dbi/api`)

Production-grade Express + Mongoose REST API powering the DBI Footfall Analytics Platform.

---

## 🚀 Quick Start & Run Commands

```bash
# 1. Install dependencies across monorepo
npm install

# 2. Build shared contracts
npm --workspace=@dbi/shared-types run build

# 3. Seed initial users (Super Admin & Demo Shop Owner)
npm --workspace=@dbi/api run seed

# 4. Start Core API in development mode (Port 4000)
npm --workspace=@dbi/api run dev

# 5. Run automated Master E2E Acceptance Test
npm --workspace=@dbi/api run test:e2e
```

---

## 🔒 Environment Configuration

Create `.env` inside `apps/api/` based on `.env.example`:

| Variable | Default / Example | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `4000` | HTTP Server port |
| `MONGODB_URI` | `mongodb://localhost:27017/dbi_footfall` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | *(32+ char secret)* | Signs JWT access tokens (expires in 24h) |
| `CAMERA_SECRET_ENCRYPTION_KEY` | *(32 char key)* | AES-256-GCM encryption key for camera RTSP credentials |
| `AI_SERVICE_SHARED_SECRET` | *(shared secret)* | Authenticates internal AI Worker events via `x-ai-secret` |
| `CAMERA_HEARTBEAT_TIMEOUT_SEC` | `90` | Inactivity threshold before camera is marked `OFFLINE` |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed frontend origin |

---

## 📡 API Contract & Endpoint Reference

All endpoints adhere to the standard envelope:
- **Success:** `{ "success": true, "data": T, "requestId": "req_..." }`
- **Error:** `{ "success": false, "error": { "code": "...", "message": "..." }, "requestId": "req_..." }`

### 1. Authentication (`/api/v1/auth`)
* `POST /api/v1/auth/register` — Register a new store owner (`email`, `password`, `name`).
* `POST /api/v1/auth/login` — Authenticate user and receive JWT access token.
* `GET /api/v1/auth/me` — Inspect current authenticated user identity.

### 2. Shop Management (`/api/v1/shops`)
* `POST /api/v1/shops` — Create a new shop (authenticated owner).
* `GET /api/v1/shops` — List shops owned by current authenticated user.
* `GET /api/v1/shops/:shopId` — Retrieve single shop details (enforces tenant isolation).
* `PATCH /api/v1/shops/:shopId` — Update shop profile (name, timezone).

### 3. Camera Security & Counting Line (`/api/v1/cameras`)
* `POST /api/v1/shops/:shopId/cameras` — Add camera. Credentials encrypted with AES-256-GCM.
* `GET /api/v1/shops/:shopId/cameras` — List cameras. Credentials and raw RTSP URLs are strictly sanitized.
* `POST /api/v1/cameras/:cameraId/test` — Test camera reachability, latency, and status.
* `PUT /api/v1/cameras/:cameraId/counting-line` — Configure virtual counting line (normalized 0..1 coordinates).
* `GET /api/v1/cameras/:cameraId/health` — Check camera connectivity with 90s stale heartbeat timeout.

### 4. Footfall Analytics & Occupancy (`/api/v1/shops/:shopId/footfall`)
* `GET /api/v1/shops/:shopId/footfall/summary` — Returns today's entries, exits, `estimatedOccupancy`, and `dataSource` (`LIVE` vs `DEMO`).
  $$\text{Estimated Occupancy} = \max(0, \text{Baseline} + \text{Entries} - \text{Exits})$$
* `GET /api/v1/shops/:shopId/footfall/timeseries` — 24-hour hourly rollup of footfall traffic.
* `POST /api/v1/shops/:shopId/footfall/occupancy-baseline` — Recalibrate occupancy baseline drift.
* `GET /api/v1/shops/:shopId/footfall/export.csv` — Download footfall data as CSV.

### 5. Super Admin Oversight (`/api/v1/admin`)
*(Requires `role: SUPER_ADMIN`)*
* `GET /api/v1/admin/overview` — Platform KPI statistics (total shops, cameras, footfall count).
* `GET /api/v1/admin/owners` — Paginated list of registered store owners.
* `GET /api/v1/admin/shops` — Paginated list of all system shops with status and owner metadata.
* `PATCH /api/v1/admin/shops/:shopId/status` — Activate/Suspend shop with mandatory audited reason (min 5 chars).
* `GET /api/v1/admin/cameras/health` — Platform-wide camera connection and heartbeat health.
* `GET /api/v1/admin/audit-logs` — Tamper-evident log of administrative actions.

### 6. Internal AI Ingestion (`/internal/v1/footfall`)
*(Requires `x-ai-secret` header matching `AI_SERVICE_SHARED_SECRET`)*
* `POST /internal/v1/footfall/events` — Ingest person line crossing events. Enforces `eventId` idempotency/deduplication.
* `POST /internal/v1/footfall/health` — Receive 30-second camera/worker heartbeat telemetry.

---

## 🛡️ Security Guarantees
1. **Multi-Tenant Isolation:** Store Owner A cannot read or modify Store Owner B's shops or cameras. Violations return `403 TENANT_VIOLATION`.
2. **Secret Sanitization:** Camera passwords and full credential-bearing RTSP URLs are encrypted outside database models and never returned in API responses.
3. **Audited Actions:** Critical administrative state changes require a structured reason recorded in immutable audit logs.