"""DBI Intelligence — Footfall AI Worker.

Discovers registered cameras from the backend, opens each camera's real video
source (RTSP / TEST_CLIP / HTTP_STREAM / WEBCAM — never MOCK_STREAM, which has
no real footage), runs a person detector + centroid tracker against the
owner-configured virtual counting line, and submits IN/OUT footfall events.
Sends a heartbeat per camera on its own interval so the dashboard's camera
health reflects real worker status.

Scope lock: this worker counts entries/exits only. It does not classify
behaviour, track individuals across zones for security purposes, or produce
anything resembling a theft/security event — see docs/README for the
project's explicit "no theft detection" boundary.
"""

import os

os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")  # must run before cv2 import, below

import sys
import threading
import time
import uuid
from typing import Optional

try:
    sys.stdout.reconfigure(encoding="utf-8")  # avoid garbled output on Windows consoles
except Exception:
    pass

import cv2

import client
from client import CONNECTOR_MODE
from config import (
    CAMERA_DISCOVERY_INTERVAL_SEC,
    DETECTION_INTERVAL_SEC,
    HEARTBEAT_INTERVAL_SEC,
    LIVE_FAST_INTERVAL_SEC,
    LIVE_IDLE_INTERVAL_SEC,
    LIVE_MAX_WIDTH,
    LIVE_POLL_INTERVAL_SEC,
    MODEL_VERSION,
    STATUS_FRESH_SECONDS,
    STATUS_GRACE_SECONDS,
    STATUS_REPORT_INTERVAL_SEC,
)
from detection.person_detector import PersonDetector
from geometry.line_crossing import NormalizedLine, Point2D, detect_line_crossing
from stream.reader import StreamReader
from tracking.centroid_tracker import CentroidTracker

_stop = threading.Event()
_watched_cameras: set = set()

# Connector mode only (CONNECTOR_MODE) — see client.py.
_camera_cfg: dict = {}  # cameraId -> latest camera record from the connector (streamUrl/countingLine)
_live_wanted: set = set()  # camera ids someone is currently watching live
_live_uploading: set = set()  # camera ids with a live-frame upload in flight right now
_last_live_push: dict = {}  # cameraId -> last live-frame push time
_camera_status: dict = {}  # cameraId -> {last_frame_at, started_at, last_report_at}


def _new_event_id() -> str:
    return f"evt_{int(time.time())}_{uuid.uuid4().hex[:10]}"


def watch_camera(camera: dict, detector: PersonDetector) -> None:
    try:
        _watch_camera(camera, detector)
    finally:
        # Early exits (no counting line, config unavailable) end the thread. Wait one discovery
        # interval, then forget the camera so discovery retries it (e.g. after a counting line
        # is drawn or the stream URL is fixed) without needing a worker restart.
        _stop.wait(CAMERA_DISCOVERY_INTERVAL_SEC)
        _watched_cameras.discard(camera["cameraId"])


def _watch_camera(camera: dict, detector: PersonDetector) -> None:
    """Runs forever (until _stop is set) for a single camera: stream -> detect -> track -> count."""
    camera_id = camera["cameraId"]
    name = camera.get("name", camera_id)

    if CONNECTOR_MODE:
        # Connector already supplied streamUrl + countingLine inline (GET .../ai/cameras) —
        # no separate stream-config call, and we keep watching even with no counting line yet.
        shop_id = camera.get("shopId")
        stream_url = camera.get("streamUrl")
        connection_type = "CONNECTOR"
        _camera_cfg[camera_id] = camera
        if not stream_url:
            print(f"[camera {camera_id}] ({name}) connector reported no streamUrl — skipping")
            return

        def current_counting_line():
            cfg = _camera_cfg.get(camera_id)
            if not cfg:
                return None
            line = cfg.get("countingLine")
            if not line or not line.get("enabled"):
                return None
            coords = line["coordinates"]
            return (
                NormalizedLine(coords["x1"], coords["y1"], coords["x2"], coords["y2"]),
                line.get("inDirection", "IN"),
                line.get("outDirection", "OUT"),
            )

        def should_restart() -> bool:
            # Camera removed from this connector, or its stream URL changed: stop so
            # discover_and_watch spins up a fresh thread with the latest config.
            cfg = _camera_cfg.get(camera_id)
            return cfg is None or cfg.get("streamUrl") != stream_url

    else:
        shop_id = camera["shopId"]
        config = client.get_stream_config(camera_id)
        if not config:
            print(f"[camera {camera_id}] could not fetch stream config — skipping")
            client.send_heartbeat(camera_id, status="OFFLINE", safe_error_code="CONFIG_UNAVAILABLE")
            return

        counting_line = config.get("countingLine")
        if not counting_line or not counting_line.get("enabled"):
            print(f"[camera {camera_id}] ({name}) no enabled counting line configured — skipping detection")
            client.send_heartbeat(camera_id, status="OFFLINE", safe_error_code="NO_COUNTING_LINE")
            return

        coords = counting_line["coordinates"]
        fixed_line = (
            NormalizedLine(coords["x1"], coords["y1"], coords["x2"], coords["y2"]),
            counting_line.get("inDirection", "IN"),
            counting_line.get("outDirection", "OUT"),
        )
        stream_url = config["streamUrl"]
        connection_type = config["connectionType"]

        def current_counting_line():
            return fixed_line

        def should_restart() -> bool:
            return False

    reader = StreamReader(stream_url)
    detector_tracker = CentroidTracker()
    last_detect_at = 0.0
    last_heartbeat_at = 0.0

    print(f"[camera {camera_id}] watching ({name}, {connection_type})")
    last_fail_report_at = 0.0

    if CONNECTOR_MODE:
        _camera_status[camera_id] = {"last_frame_at": None, "started_at": time.time(), "last_report_at": 0.0}

    def report_unreachable() -> None:
        # The reader calls this while it cannot open/read the stream. Previously no heartbeat
        # was sent at all in that state, so the camera went stale (>90s => OFFLINE) with no reason.
        nonlocal last_fail_report_at
        now = time.time()
        if now - last_fail_report_at >= HEARTBEAT_INTERVAL_SEC:
            client.send_heartbeat(camera_id, status="OFFLINE", safe_error_code="STREAM_UNREACHABLE")
            last_fail_report_at = now

    try:
        for frame in reader.frames(lambda: _stop.is_set() or should_restart(), on_fail=report_unreachable):
            now = time.time()

            if CONNECTOR_MODE:
                status = _camera_status.get(camera_id)
                if status is not None:
                    status["last_frame_at"] = now
                push_live_frame(camera_id, frame)

            if now - last_heartbeat_at >= HEARTBEAT_INTERVAL_SEC:
                client.send_heartbeat(camera_id, status="ONLINE")
                last_heartbeat_at = now

            if now - last_detect_at < DETECTION_INTERVAL_SEC:
                continue
            last_detect_at = now

            line = current_counting_line()
            if line is None:
                continue  # no enabled counting line yet — still watching, just not counting
            virtual_line, in_direction, out_direction = line

            h, w = frame.shape[:2]
            detections = detector.detect(frame)
            centroids = [d.centroid for d in detections]
            confidence_by_centroid = {d.centroid: d.confidence for d in detections}

            tracks = detector_tracker.update(centroids, frame_width=w)

            for track in tracks.values():
                if track.prev_centroid is None:
                    continue  # brand-new or just-recovered track: no trajectory yet

                prev_norm = Point2D(track.prev_centroid[0] / w, track.prev_centroid[1] / h)
                curr_norm = Point2D(track.centroid[0] / w, track.centroid[1] / h)

                direction = detect_line_crossing(virtual_line, prev_norm, curr_norm, in_direction, out_direction)
                if direction is None:
                    continue

                confidence = confidence_by_centroid.get(track.centroid, 0.7)
                event_id = _new_event_id()
                print(f"[camera {camera_id}] crossing detected: {direction} (track={track.track_id}, conf={confidence:.2f})")

                if not shop_id:
                    print(f"[camera {camera_id}] no shopId available — dropping event {event_id}")
                    continue

                client.send_footfall_event(
                    {
                        "eventId": event_id,
                        "shopId": shop_id,
                        "cameraId": camera_id,
                        "direction": direction,
                        "occurredAt": _iso_now(),
                        "confidence": confidence,
                        "modelVersion": MODEL_VERSION,
                    }
                )
    finally:
        reader.close()
        client.send_heartbeat(camera_id, status="OFFLINE")
        if CONNECTOR_MODE:
            _camera_status.pop(camera_id, None)
        print(f"[camera {camera_id}] stopped watching")


def _encode_live_jpeg(frame) -> Optional[bytes]:
    h, w = frame.shape[:2]
    if w > LIVE_MAX_WIDTH:
        scale = LIVE_MAX_WIDTH / w
        frame = cv2.resize(frame, (LIVE_MAX_WIDTH, int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    if not ok:
        return None
    return buf.tobytes()


def push_live_frame(camera_id: str, frame) -> None:
    """Connector mode only. Rate-limited, off-thread — must never block frame reading/detection."""
    if camera_id in _live_uploading:
        return
    now = time.time()
    interval = LIVE_FAST_INTERVAL_SEC if camera_id in _live_wanted else LIVE_IDLE_INTERVAL_SEC
    if now - _last_live_push.get(camera_id, 0.0) < interval:
        return
    _last_live_push[camera_id] = now
    _live_uploading.add(camera_id)

    def _upload() -> None:
        try:
            jpeg = _encode_live_jpeg(frame)
            if jpeg:
                client.upload_live_frame(camera_id, jpeg)
        finally:
            _live_uploading.discard(camera_id)

    threading.Thread(target=_upload, daemon=True).start()


def live_wanted_poller() -> None:
    """Connector mode only: refreshes which cameras are currently being watched live."""
    global _live_wanted
    while not _stop.is_set():
        wanted = client.get_live_wanted()
        if wanted is not None:
            _live_wanted = set(wanted)
        _stop.wait(LIVE_POLL_INTERVAL_SEC)


def report_camera_status() -> None:
    """Connector mode only: real-frame-based online/offline, independent of the heartbeat."""
    while not _stop.is_set():
        now = time.time()
        for camera_id, status in list(_camera_status.items()):
            if status["last_frame_at"] is None and now - status["started_at"] < STATUS_GRACE_SECONDS:
                continue  # still connecting — don't report a false offline yet
            if now - status.get("last_report_at", 0.0) < STATUS_REPORT_INTERVAL_SEC:
                continue
            online = status["last_frame_at"] is not None and (now - status["last_frame_at"]) <= STATUS_FRESH_SECONDS
            status["last_report_at"] = now
            client.report_camera_status(camera_id, online, None if online else "NO_VIDEO")
        _stop.wait(1.0)


def _iso_now() -> str:
    import datetime

    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def discover_and_watch() -> None:
    """Starts one watcher thread per camera, re-scanning periodically for newly added cameras."""
    detector = PersonDetector()

    if CONNECTOR_MODE:
        threading.Thread(target=live_wanted_poller, daemon=True).start()
        threading.Thread(target=report_camera_status, daemon=True).start()

    while not _stop.is_set():
        for cam in client.list_cameras():
            cam_id = cam["cameraId"]
            if CONNECTOR_MODE:
                _camera_cfg[cam_id] = cam  # keeps a watched camera's countingLine/streamUrl live
            if cam_id in _watched_cameras:
                continue
            _watched_cameras.add(cam_id)
            t = threading.Thread(target=watch_camera, args=(cam, detector), daemon=True)
            t.start()

        for _ in range(CAMERA_DISCOVERY_INTERVAL_SEC):
            if _stop.is_set():
                break
            time.sleep(1)


def main() -> None:
    print("=========================================")
    print("  DBI Intelligence - Footfall AI Worker")
    from config import CORE_API_URL, WORKER_ID

    print(f"  Backend: {CORE_API_URL}")
    print(f"  Mode: {'connector (' + WORKER_ID + ')' if CONNECTOR_MODE else 'standalone'}")
    print("=========================================")

    try:
        discover_and_watch()
    except KeyboardInterrupt:
        print("\n[AI Worker] Shutting down gracefully...")
        _stop.set()


if __name__ == "__main__":
    main()
