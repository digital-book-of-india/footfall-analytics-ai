# DBI Intelligence — AI Footfall Analytics: Owner Panel (Developer 1)

This application is the store owner-facing web interface for DBI Intelligence AI Footfall Analytics MVP.

## Primary Ownership & Deliverables
- **Owner Authentication & Session**: Sign-in, registration, and token persistence for `SHOP_OWNER` role (`POST /auth/register`, `POST /auth/login`, `GET /auth/me`).
- **Store Onboarding & Profile**: Create store locations, configure operational timezones, manage baseline occupancy offsets, and toggle store switcher (`POST /shops`, `GET /shops`, `PATCH /shops/:shopId`).
- **Camera Management & Test Action**: Connect entrance cameras with secure connection types (RTSP, MOCK_STREAM). Trigger stream verification diagnostics (`POST /shops/:shopId/cameras`, `GET /shops/:shopId/cameras`, `POST /cameras/:cameraId/test`).
- **Interactive Virtual Counting Line Calibration**: Drag-and-drop / coordinate-calibrated virtual crossing line with normalized coordinates (0..1), directional indicators (IN / OUT), and active status toggle (`PUT /cameras/:cameraId/counting-line`).
- **Footfall Analytics Dashboard**:
  - Real-time KPI cards: Today's Entries, Today's Exits, Estimated In-Store Occupancy, Baseline Offset.
  - Interactive hourly traffic trend chart (24-hour entries vs exits distribution).
  - Accuracy Drift Calibration modal (`POST /shops/:shopId/footfall/occupancy-baseline`).
  - Strict Data Source labeling (`LIVE` vs `DEMO`).
  - Audit quality indicators (`OK`, `DEGRADED`, `INCOMPLETE`, `RESET_REQUIRED`).
- **Reports & Audited CSV Export**: Granular 60-minute interval breakdown with date filtering and instant CSV export download (`GET /shops/:shopId/footfall/timeseries`, `GET /shops/:shopId/footfall/export.csv`).
- **Secret Handling**: RTSP credentials and passwords are encrypted and masked (`rtsp://user:****@host/path`); raw credentials never leak in UI, API responses, or console logs.

## Routes & Views
| View | Description | Key APIs Integrated |
| --- | --- | --- |
| `/auth` | Owner login & registration with 1-click Demo mode | `POST /auth/login`, `POST /auth/register`, `GET /auth/me` |
| `/dashboard` | Real-time footfall metrics, hourly chart, drift calibration | `GET /shops/:shopId/footfall/summary`, `GET /shops/:shopId/footfall/timeseries`, `POST /shops/:shopId/footfall/occupancy-baseline` |
| `/cameras` | Entrance camera list, stream test status, virtual line modal | `GET /shops/:shopId/cameras`, `POST /shops/:shopId/cameras`, `POST /cameras/:cameraId/test`, `PUT /cameras/:cameraId/counting-line` |
| `/reports` | Hourly breakdown table and direct CSV export | `GET /shops/:shopId/footfall/timeseries`, `GET /shops/:shopId/footfall/export.csv` |
| `/settings` | Shop profile metadata, timezone, baseline occupancy | `GET /shops/:shopId`, `PATCH /shops/:shopId`, `POST /shops` |

## Run & Test Commands
```bash
# 1. Run unit and end-to-end smoke test suite
npm --prefix apps/web-owner test

# 2. Run TypeScript typecheck
npm --prefix apps/web-owner run typecheck

# 3. Build production bundle
npm --prefix apps/web-owner run build

# 4. Start local development server (Port 3000)
npm --prefix apps/web-owner run dev
```

## Known Limitations & MVP Constraints
1. **Normal Footfall Analytics Scope Lock**: No theft detection, customer face recognition, rack tracking, or POS item matching.
2. **No Browser RTSP Playback**: In line with architecture guidelines, RTSP streams are processed server-side in memory by the AI pipeline. The browser displays visual line calibration over camera frames and connection test statuses without exposing RTSP ports directly to the browser.
3. **Drift Compensation**: Estimated occupancy is calculated as `Baseline + IN - OUT`. Camera occlusion and groups can introduce small count drifts over time; the owner panel provides an audited **Calibrate Occupancy** feature to reconcile counters with physical store headcounts.
4. **Mock Adapter Mode**: An in-browser mock adapter is provided (`VITE_FORCE_MOCK=true` or UI toggle button) that implements all `/api/v1` contract responses with persistent state so UI development, smoke testing, and demonstrations function without requiring live cameras or backend servers to be running.