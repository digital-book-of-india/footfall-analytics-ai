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
