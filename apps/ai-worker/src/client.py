"""HTTP client for the footfall Core API's internal AI-service endpoints.

Standalone mode: requests carry 'x-ai-secret', checked by apps/api's requireAiServiceSecret
middleware against AI_SERVICE_SHARED_SECRET — these endpoints are never reachable by
owner/admin-facing auth tokens.

Connector mode (CONNECTOR_TOKEN set): requests carry 'x-connector-token' instead and hit the
connector-scoped '/internal/v1/connectors/ai/...' routes, used when the on-site Connector
spawns this worker to reach cameras the cloud worker can't.
"""

from typing import Any, Dict, List, Optional

import requests

from config import AI_SERVICE_SHARED_SECRET, CONNECTOR_TOKEN, CORE_API_URL

CONNECTOR_MODE = bool(CONNECTOR_TOKEN)

if CONNECTOR_MODE:
    _HEADERS = {"Content-Type": "application/json", "x-connector-token": CONNECTOR_TOKEN}
    _PREFIX = "/internal/v1/connectors/ai"
else:
    _HEADERS = {"Content-Type": "application/json", "x-ai-secret": AI_SERVICE_SHARED_SECRET}
    _PREFIX = "/internal/v1/footfall"


def _get(path: str) -> Optional[Dict[str, Any]]:
    try:
        resp = requests.get(f"{CORE_API_URL}{path}", headers=_HEADERS, timeout=8)
        if not resp.ok:
            print(f"[client] GET {path} -> HTTP {resp.status_code}: {resp.text[:200]}")
            return None
        return resp.json()
    except requests.RequestException as e:
        print(f"[client] GET {path} failed: {e}")
        return None


def _post(path: str, payload: Any) -> Optional[Dict[str, Any]]:
    try:
        resp = requests.post(f"{CORE_API_URL}{path}", json=payload, headers=_HEADERS, timeout=8)
        if not resp.ok:
            print(f"[client] POST {path} -> HTTP {resp.status_code}: {resp.text[:200]}")
            return None
        return resp.json()
    except requests.RequestException as e:
        print(f"[client] POST {path} failed: {e}")
        return None


def list_cameras() -> List[Dict[str, Any]]:
    body = _get(f"{_PREFIX}/cameras")
    if not body:
        return []
    if CONNECTOR_MODE:
        # { data: { cameras: [{ id, shopId, name, streamUrl, countingLine }] } } — streamUrl
        # and countingLine are inline already, no separate stream-config call needed.
        cameras = ((body.get("data") or {}).get("cameras")) or []
        normalized = []
        for cam in cameras:
            cam_id = cam.get("id")
            if not cam_id:
                continue
            normalized.append(
                {
                    "cameraId": cam_id,
                    "shopId": cam.get("shopId"),
                    "name": cam.get("name"),
                    "streamUrl": cam.get("streamUrl"),
                    "countingLine": cam.get("countingLine"),
                }
            )
        return normalized
    if not body.get("success"):
        return []
    return body.get("data", [])


def get_stream_config(camera_id: str) -> Optional[Dict[str, Any]]:
    # Standalone mode only — connector mode gets streamUrl/countingLine inline from list_cameras().
    body = _get(f"/internal/v1/footfall/cameras/{camera_id}/stream-config")
    if not body or not body.get("success"):
        return None
    return body.get("data")


def send_footfall_event(event: Dict[str, Any]) -> bool:
    body = _post(f"{_PREFIX}/events", event)
    return bool(body and body.get("success"))


def send_heartbeat(camera_id: str, status: str = "ONLINE", safe_error_code: Optional[str] = None) -> bool:
    payload: Dict[str, Any] = {"cameraId": camera_id, "status": status}
    if safe_error_code:
        payload["safeErrorCode"] = safe_error_code
    body = _post(f"{_PREFIX}/health", payload)
    return bool(body and body.get("success"))


def get_live_wanted() -> Optional[List[str]]:
    """Connector mode only: camera ids someone is currently watching live."""
    body = _get(f"{_PREFIX}/live-wanted")
    if body is None:
        return None
    return ((body.get("data") or {}).get("cameraIds")) or []


def upload_live_frame(camera_id: str, jpeg_bytes: bytes) -> bool:
    """Connector mode only: raw-body JPEG upload, short timeout — must never block detection."""
    try:
        resp = requests.post(
            f"{CORE_API_URL}{_PREFIX}/live-frame/{camera_id}",
            data=jpeg_bytes,
            headers={**_HEADERS, "Content-Type": "image/jpeg"},
            timeout=4,
        )
        return resp.status_code in (200, 204)
    except requests.RequestException:
        return False


def report_camera_status(camera_id: str, online: bool, error_code: Optional[str]) -> bool:
    """Connector mode only: real-frame-based online/offline, independent of the ONLINE/OFFLINE heartbeat."""
    payload: Dict[str, Any] = {"cameraId": camera_id, "online": online}
    if error_code:
        payload["errorCode"] = error_code
    body = _post(f"{_PREFIX}/camera-status", payload)
    return body is not None
