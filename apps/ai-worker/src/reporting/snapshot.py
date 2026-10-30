"""Builds the annotated evidence JPEG for a zone-watch alert.

Uploading it is handled by client.py's upload_evidence() (shares this worker's existing
connector/standalone auth-header switching instead of duplicating it here) — this module only
does the image work. Ported from the sibling theaft-ai project's reporting/snapshot.py.
"""

import cv2
import numpy as np


def encode_jpeg(frame: np.ndarray, quality: int = 85, max_width: int = 0) -> bytes:
    if max_width and frame.shape[1] > max_width:
        scale = max_width / frame.shape[1]
        frame = cv2.resize(frame, (max_width, int(frame.shape[0] * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("Failed to encode snapshot as JPEG")
    return buf.tobytes()


def annotate_evidence(frame: np.ndarray, bbox=None, zone=None) -> np.ndarray:
    """A copy of the frame with the watched zone outlined (blue) and the detected person boxed (red),
    so the owner can see what the alert was about. The original frame is left untouched."""
    out = frame.copy()
    h, w = out.shape[:2]
    thickness = max(2, w // 320)
    polygon = (zone or {}).get("polygon") or []
    if len(polygon) >= 3:
        pts = np.array([[int(p["x"] * w), int(p["y"] * h)] for p in polygon], dtype=np.int32)
        cv2.polylines(out, [pts], True, (255, 120, 30), thickness)
    if bbox is not None:
        x, y, bw, bh = [int(v) for v in bbox]
        cv2.rectangle(out, (x, y), (x + bw, y + bh), (0, 0, 255), thickness)
    return out
