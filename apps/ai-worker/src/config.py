"""Worker configuration, loaded from environment (.env in dev)."""

import os

from dotenv import load_dotenv

load_dotenv()

CORE_API_URL = os.getenv("CORE_API_URL", "http://localhost:4000").rstrip("/")
AI_SERVICE_SHARED_SECRET = os.getenv("AI_SERVICE_SHARED_SECRET", "dbi_ai_service_shared_secret_2026")
HEARTBEAT_INTERVAL_SEC = int(os.getenv("HEARTBEAT_INTERVAL_SEC", "30"))
CAMERA_DISCOVERY_INTERVAL_SEC = int(os.getenv("CAMERA_DISCOVERY_INTERVAL_SEC", "60"))
DETECTION_INTERVAL_SEC = float(os.getenv("DETECTION_INTERVAL_SEC", "0.5"))
MODEL_VERSION = os.getenv("MODEL_VERSION", "hog-crossing-v1.0")

# Connector mode: set when the on-site Connector spawns this worker to reach cameras the
# cloud can't. CONNECTOR_TOKEN present -> use the connector-scoped internal API instead of
# the standalone AI_SERVICE_SHARED_SECRET path (see client.py).
CONNECTOR_TOKEN = os.getenv("CONNECTOR_TOKEN", "")
WORKER_ID = os.getenv("WORKER_ID", "worker-1")

# Live-view frame push (connector mode only)
LIVE_FAST_INTERVAL_SEC = float(os.getenv("LIVE_FAST_INTERVAL_SEC", "1.0"))
LIVE_IDLE_INTERVAL_SEC = float(os.getenv("LIVE_IDLE_INTERVAL_SEC", "60.0"))
LIVE_POLL_INTERVAL_SEC = float(os.getenv("LIVE_POLL_INTERVAL_SEC", "2.0"))
LIVE_MAX_WIDTH = int(os.getenv("LIVE_MAX_WIDTH", "960"))

# Real-frame-based camera status reporting (connector mode only)
STATUS_REPORT_INTERVAL_SEC = float(os.getenv("STATUS_REPORT_INTERVAL_SEC", "30"))
STATUS_FRESH_SECONDS = float(os.getenv("STATUS_FRESH_SECONDS", "75"))
STATUS_GRACE_SECONDS = float(os.getenv("STATUS_GRACE_SECONDS", "20"))
