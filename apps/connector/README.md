# DBI Footfall Connector

On-site Windows agent (Electron tray app) that pairs a shop's LAN with the cloud API and
syncs cameras that are not directly reachable by the cloud Python AI worker (e.g. behind
NAT/firewall — common for real shop networks; see the project's own "do not expose RTSP
ports publicly" rule).

## Why this exists

The cloud `apps/ai-worker` needs a route to the camera's RTSP stream. When that's not
possible, this connector runs on a PC inside the shop's own network, where the camera
*is* reachable, and bridges it to the backend instead.

## Run in dev

```
npm install
npm start
```

On first run it shows a pairing window. Create a connector for a shop in the owner panel
(Shop -> Connectors -> New Connector) to get a pairing code, paste it in, and the app starts
its background heartbeat + camera-sync loops and sits in the system tray.

`DBI_CONNECTOR_BACKEND_URL` (see `.env.example`) controls which backend it talks to; it
defaults to `http://localhost:4000` for local dev.

## Build the installer

```
DBI_CONNECTOR_BACKEND_URL=https://your-api-host npm run dist
```

Produces a Windows NSIS installer under `dist/`. `npm run publish` additionally uploads it
to GitHub Releases (see `.github/workflows/connector-release.yml`), which is the feed
`electron-updater` polls for auto-updates once the app is packaged (`app.isPackaged`).

## Scope

Stage 1 (this app, today): pairing, heartbeat, and camera-list sync only — it proves a
camera is assigned to this connector and reports status. It does not yet run detection
locally; cameras synced here still need a cloud or local worker to actually open the
stream and post footfall events.
