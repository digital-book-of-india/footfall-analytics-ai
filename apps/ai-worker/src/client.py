"""HTTP client for the footfall Core API's internal AI-service endpoints.

All requests carry 'x-ai-secret', checked by apps/api's requireAiServiceSecret
middleware against AI_SERVICE_SHARED_SECRET — these endpoints are never reachable
by owner/admin-facing auth tokens.
"""

from typing import Any, Dict, List, Optional

import requests

from config import AI_SERVICE_SHARED_SECRET, CORE_API_URL

_HEADERS = {"Content-Type": "application/json", "x-ai-secret": AI_SERVICE_SHARED_SECRET}


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
    body = _get("/internal/v1/footfall/cameras")
    if not body or not body.get("success"):
        return []
    return body.get("data", [])


def get_stream_config(camera_id: str) -> Optional[Dict[str, Any]]:
    body = _get(f"/internal/v1/footfall/cameras/{camera_id}/stream-config")
    if not body or not body.get("success"):
        return None
    return body.get("data")


def send_footfall_event(event: Dict[str, Any]) -> bool:
    body = _post("/internal/v1/footfall/events", event)
    return bool(body and body.get("success"))


def send_heartbeat(camera_id: str, status: str = "ONLINE", safe_error_code: Optional[str] = None) -> bool:
    payload: Dict[str, Any] = {"cameraId": camera_id, "status": status}
    if safe_error_code:
        payload["safeErrorCode"] = safe_error_code
    body = _post("/internal/v1/footfall/health", payload)
    return bool(body and body.get("success"))
