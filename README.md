# 🏪 DBI Intelligence — AI Footfall Analytics (Day 1 Web MVP)

AI-powered retail footfall analytics platform delivering live store entry/exit counting, occupancy estimation, camera line-crossing configuration, and multi-tenant store oversight.

---

## 🏗️ Monorepo Architecture

```
footfall-analytics-ai/
├── apps/
│   ├── api/             # Developer 3: Express + Mongoose REST API (Port 4000)
│   ├── ai-worker/       # Developer 3: Python/OpenCV stream processor, person detector & line-crossing counter
│   ├── connector/       # On-site Windows agent (Electron): bridges LAN cameras the cloud AI worker can't reach directly
│   ├── web-owner/       # Developer 1: Store Owner Portal (Vite + React)
│   └── web-admin/       # Developer 2: Super Admin Portal (Vite + React)
└── packages/
    └── shared-types/    # Shared TypeScript contracts, DTOs, and Enums
```

---

## 🎯 Day 1 Scope & Boundary

### In Scope (P0)
* **Owner Journey:** Shop onboarding, entrance camera registration with masked RTSP credentials, interactive virtual counting line configuration, live summary cards, hourly traffic charts, and CSV report export.
* **AI Ingestion:** 2D line crossing event detection, unique `eventId` idempotency/deduplication, transparent `DEMO` vs `LIVE` data source labeling, and 30-second worker heartbeats.
* **Occupancy Estimation:** $\text{Estimated Occupancy} = \max(0, \text{Baseline} + \text{Entries} - \text{Exits})$ with drift recalibration action.
* **Super Admin Control:** Platform KPI overview, shop activate/suspend with mandatory reason, camera health panel (90s stale heartbeat detection), and immutable audit logs.
* **Security & Isolation:** Strict tenant separation (403 `TENANT_VIOLATION`), AES-256-GCM encrypted camera credentials, and credential sanitization in all APIs.

### Explicitly Out of Scope
* No theft detection, product/rack tracking, POS matching, facial recognition, or demographic profiling.

---

## ⚡ Quick Start & Run Commands

### 1. Installation & Build
```bash
npm install
npm run build
```

### 2. Run All Services Locally
In separate terminal windows:

* **Backend API (Port 4000):**
  ```bash
  npm --workspace=@dbi/api run dev
  ```
* **AI Worker Service** (Python, not an npm workspace — see `apps/ai-worker/README.md`):
  ```bash
  cd apps/ai-worker
  python -m venv .venv && .venv\Scripts\pip install -r requirements.txt
  copy .env.example .env
  cd src && ..\.venv\Scripts\python.exe main.py
  ```
* **Owner Web Portal (Port 5173 / 3000):**
  ```bash
  npm --workspace=web-owner run dev
  ```
* **Super Admin Web Portal (Port 5174):**
  ```bash
  npm --workspace=web-admin run dev
  ```
* **On-site Connector** (Electron desktop agent, only needed when a camera is not directly
  reachable by the cloud AI worker — see `apps/connector/README.md`):
  ```bash
  cd apps/connector
  npm install
  npm start
  ```

---

## 🧪 Verification & Test Suites

* **Full Monorepo Build:**
  ```bash
  npm run build
  ```
* **Backend E2E Acceptance Test:**
  ```bash
  npm --workspace=@dbi/api run test:e2e
  ```
* **AI Worker Unit Tests:**
  ```bash
  cd apps/ai-worker
  .venv\Scripts\python.exe -m pytest tests/test_line_crossing.py tests/test_tracker.py -v
  ```
* **Web Owner Vitest Suite (34 Tests):**
  ```bash
  npx vitest run
  ```

---

## 👥 Default Seed Credentials

Run `npm --workspace=@dbi/api run seed` to initialize test accounts:

* **Super Admin:**
  * Email: `admin@dbi.ai`
  * Password: `Password@123`
  * Role: `SUPER_ADMIN`
* **Demo Shop Owner:**
  * Email: `owner@demo.com`
  * Password: `Password@123`
  * Role: `SHOP_OWNER`
* **Other Store Owner (Tenant Isolation testing):**
  * Email: `other@demo.com`
  * Password: `Password@123`
  * Role: `SHOP_OWNER`
