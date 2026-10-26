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

import sys
import threading
import time
import uuid
from typing import Optional

try:
    sys.stdout.reconfigure(encoding="utf-8")  # avoid garbled output on Windows consoles
except Exception:
    pass

import client
from config import CAMERA_DISCOVERY_INTERVAL_SEC, DETECTION_INTERVAL_SEC, HEARTBEAT_INTERVAL_SEC, MODEL_VERSION
from detection.person_detector import PersonDetector
from geometry.line_crossing import NormalizedLine, Point2D, detect_line_crossing
from stream.reader import StreamReader
from tracking.centroid_tracker import CentroidTracker

_stop = threading.Event()
_watched_cameras: set = set()


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
    shop_id = camera["shopId"]
    name = camera.get("name", camera_id)

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
    virtual_line = NormalizedLine(coords["x1"], coords["y1"], coords["x2"], coords["y2"])
    in_direction_rule = counting_line.get("inDirection", "TOP_TO_BOTTOM")

    reader = StreamReader(config["streamUrl"])
    detector_tracker = CentroidTracker()
    last_detect_at = 0.0
    last_heartbeat_at = 0.0

    print(f"[camera {camera_id}] watching ({name}, {config['connectionType']})")
    last_fail_report_at = 0.0

    def report_unreachable() -> None:
        # The reader calls this while it cannot open/read the stream. Previously no heartbeat
        # was sent at all in that state, so the camera went stale (>90s => OFFLINE) with no reason.
        nonlocal last_fail_report_at
        now = time.time()
        if now - last_fail_report_at >= HEARTBEAT_INTERVAL_SEC:
            client.send_heartbeat(camera_id, status="OFFLINE", safe_error_code="STREAM_UNREACHABLE")
            last_fail_report_at = now

    try:
        for frame in reader.frames(lambda: _stop.is_set(), on_fail=report_unreachable):
            now = time.time()

            if now - last_heartbeat_at >= HEARTBEAT_INTERVAL_SEC:
                client.send_heartbeat(camera_id, status="ONLINE")
                last_heartbeat_at = now

            if now - last_detect_at < DETECTION_INTERVAL_SEC:
                continue
            last_detect_at = now

            h, w = frame.shape[:2]
            detections = detector.detect(frame)
            centroids = [d.centroid for d in detections]
            confidence_by_centroid = {d.centroid: d.confidence for d in detections}

            tracks = detector_tracker.update(centroids)

            for track in tracks.values():
                if track.prev_centroid is None:
                    continue  # brand-new or just-recovered track: no trajectory yet

                prev_norm = Point2D(track.prev_centroid[0] / w, track.prev_centroid[1] / h)
                curr_norm = Point2D(track.centroid[0] / w, track.centroid[1] / h)

                direction = detect_line_crossing(virtual_line, prev_norm, curr_norm, in_direction_rule)
                if direction is None:
                    continue

                confidence = confidence_by_centroid.get(track.centroid, 0.7)
                event_id = _new_event_id()
                print(f"[camera {camera_id}] crossing detected: {direction} (track={track.track_id}, conf={confidence:.2f})")

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
        print(f"[camera {camera_id}] stopped watching")


def _iso_now() -> str:
    import datetime

    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def discover_and_watch() -> None:
    """Starts one watcher thread per camera, re-scanning periodically for newly added cameras."""
    detector = PersonDetector()

    while not _stop.is_set():
        for cam in client.list_cameras():
            cam_id = cam["cameraId"]
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
    from config import CORE_API_URL

    print(f"  Backend: {CORE_API_URL}")
    print("=========================================")

    try:
        discover_and_watch()
    except KeyboardInterrupt:
        print("\n[AI Worker] Shutting down gracefully...")
        _stop.set()


if __name__ == "__main__":
    main()
