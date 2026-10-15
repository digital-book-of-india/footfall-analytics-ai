## 1. Overview
Modular implementation of Super Admin APIs and live portal integration for Footfall Analytics AI MVP.

## 2. Endpoints Exposed
- GET /api/v1/admin/overview: Real-time KPI counters (active/suspended shops, online/offline cameras, stream worker status).
- GET /api/v1/admin/shops: Paginated and searchable shop directory with status filtering.
- GET /api/v1/admin/owners: Paginated directory of registered merchants with associated shop counts.
- PATCH /api/v1/admin/shops/:shopId/status: Atomic status transition with mandatory 5+ char audit logging.
- GET /api/v1/admin/cameras/health: Real-time fleet health monitor evaluating stale heartbeats (>90s) and safe error codes.
- GET /api/v1/admin/audit-logs: Immutable platform action trail tracking actor email, action, reason, and request IDs.

## 3. Dev 3 Integration Handshake
1. Mount router: app.use('/api/v1/admin', adminRouter);
2. CORS allowlist: CORS_ORIGIN=http://localhost:3000,http://localhost:3001
3. Super Admin user: Provide role SUPER_ADMIN (admin@dbi.local).

## 4. Security
- Sensitive RTSP credentials stripped from responses.
- Strict SUPER_ADMIN RBAC enforcement.
\`;
