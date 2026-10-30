"""DBI Intelligence — Footfall & Zone-Watch AI Worker.

Discovers registered cameras from the backend, opens each camera's real video
source (RTSP / TEST_CLIP / HTTP_STREAM / WEBCAM — never MOCK_STREAM, which has
no real footage), and runs a person detector against whichever of the two the
owner has configured per camera:
  - a virtual counting line (centroid-tracked across frames) -> IN/OUT footfall events.
  - a security zone polygon (e.g. around a shutter/gate) -> PERSON_IN_ZONE /
    POSSIBLE_SHUTTER_INTERACTION alerts with an annotated evidence snapshot (_watch_zone()).
Both can run on the same camera at once, off the same per-frame detections.
Sends a heartbeat per camera on its own interval so the dashboard's camera
health reflects real worker status.
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
    MIN_ZONE_PERSON_CONFIDENCE,
    MODEL_VERSION,
    STATUS_FRESH_SECONDS,
    STATUS_GRACE_SECONDS,
    STATUS_REPORT_INTERVAL_SEC,
)
from detection.person_detector import PersonDetector
from detection.background import BackgroundModel
from detection.face_check import FaceChecker
from geometry.line_crossing import NormalizedLine, Point2D, detect_line_crossing
from heuristics.classifier import EventClassifier
from reporting.snapshot import annotate_evidence, encode_jpeg
from stream.reader import StreamReader
from tracking.centroid_tracker import CentroidTracker
from zones.zone_loader import feet_position, is_in_zone, matches_ignored

_stop = threading.Event()
_watched_cameras: set = set()
_face_checker: "FaceChecker" = None  # type: ignore[assignment] # loaded once in discover_and_watch
_detector_name = MODEL_VERSION  # overwritten with the real detector name once it loads

# Connector mode only (CONNECTOR_MODE) — see client.py.
_camera_cfg: dict = {}  # cameraId -> latest camera record from the connector (streamUrl/countingLine)
_live_wanted: set = set()  # camera ids someone is currently watching live
_live_uploading: set = set()  # camera ids with a live-frame upload in flight right now
_last_live_push: dict = {}  # cameraId -> last live-frame push time
_camera_status: dict = {}  # cameraId -> {last_frame_at, started_at, last_report_at}


def _new_event_id() -> str:
    return f"evt_{int(time.time())}_{uuid.uuid4().hex[:10]}"


def _watch_zone(
    camera_id: str,
    shop_id: str,
    frame,
    w: int,
    h: int,
    detections,
    zone: dict,
    ignore_regions: list,
    zone_classifier: EventClassifier,
    zone_background: BackgroundModel,
) -> None:
    """One detection cycle of zone-watch alerting for a single camera — person-in-zone /
    shutter-interaction, with an annotated evidence snapshot. Runs off the same `detections` the
    counting-line logic above already computed; does its own cross-frame "is this the same visit"
    bookkeeping via `zone_classifier` (no shared tracker needed, unlike line-crossing)."""
    candidates = [
        det for det in detections
        if det.confidence >= MIN_ZONE_PERSON_CONFIDENCE and is_in_zone(det.bbox, w, h, zone)
    ]
    # Keeps the picture of the empty scene up to date (and still while someone stands in the zone).
    zone_background.update(frame, [d.bbox for d in detections], bool(candidates))

    in_zone_detection = None
    for det in candidates:
        if matches_ignored(det.bbox, w, h, ignore_regions):
            continue  # where the owner already called an earlier alert a false alarm
        if not zone_background.is_new_object(frame, det.bbox):
            continue  # something that was always there (poster, board, mannequin)
        if _face_checker is not None and _face_checker.face_visible(frame, det.bbox) is True:
            continue  # looking at the camera — a customer/passer-by, not the alert this zone is for
        in_zone_detection = det
        break

    decision = zone_classifier.update(
        camera_id,
        in_zone_detection is not None,
        in_zone_detection.confidence if in_zone_detection else 0.0,
        feet_position(in_zone_detection.bbox, w, h) if in_zone_detection else None,
    )
    if decision is None:
        return

    print(f"[camera {camera_id}] zone alert: {decision['eventType']} (dwell={decision['dwellSeconds']}s)")

    event_id = _new_event_id()
    object_key = f"private/{shop_id}/events/{event_id}.jpg"
    uploaded = False
    try:
        jpeg_bytes = encode_jpeg(annotate_evidence(frame, in_zone_detection.bbox if in_zone_detection else None, zone))
        uploaded = client.upload_evidence(object_key, jpeg_bytes)
    except Exception as e:  # noqa: BLE001 - a snapshot failure must not drop the alert itself
        print(f"[camera {camera_id}] evidence snapshot failed: {e}")

    client.send_security_event(
        {
            "eventId": event_id,
            "shopId": shop_id,
            "cameraId": camera_id,
            "eventType": decision["eventType"],
            "confidence": decision["confidence"],
            "startedAt": _iso_now(),
            "evidence": {"snapshotObjectKey": object_key} if uploaded else {},
            "region": (
                {
                    "x": in_zone_detection.bbox[0] / w,
                    "y": in_zone_detection.bbox[1] / h,
                    "w": in_zone_detection.bbox[2] / w,
                    "h": in_zone_detection.bbox[3] / h,
                }
                if in_zone_detection
                else None
            ),
            "modelVersion": _detector_name,
        }
    )


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

        def current_zone():
            cfg = _camera_cfg.get(camera_id)
            if not cfg:
                return None
            zone = cfg.get("zone")
            if not zone or not zone.get("enabled"):
                return None
            return zone

        def current_ignore_regions():
            return (_camera_cfg.get(camera_id) or {}).get("ignoreRegions") or []

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
        zone_cfg = config.get("zone")
        fixed_line = None
        if counting_line and counting_line.get("enabled"):
            coords = counting_line["coordinates"]
            fixed_line = (
                NormalizedLine(coords["x1"], coords["y1"], coords["x2"], coords["y2"]),
                counting_line.get("inDirection", "IN"),
                counting_line.get("outDirection", "OUT"),
            )
        fixed_zone = zone_cfg if (zone_cfg and zone_cfg.get("enabled")) else None
        fixed_ignore_regions = config.get("ignoreRegions") or []

        if fixed_line is None and fixed_zone is None:
            print(f"[camera {camera_id}] ({name}) no enabled counting line or zone configured — skipping detection")
            client.send_heartbeat(camera_id, status="OFFLINE", safe_error_code="NO_COUNTING_LINE")
            return

        stream_url = config["streamUrl"]
        connection_type = config["connectionType"]

        def current_counting_line():
            return fixed_line

        def current_zone():
            return fixed_zone

        def current_ignore_regions():
            return fixed_ignore_regions

        def should_restart() -> bool:
            return False

    reader = StreamReader(stream_url)
    detector_tracker = CentroidTracker()
    zone_classifier = EventClassifier()
    zone_background = BackgroundModel()
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
            zone = current_zone()
            if line is None and zone is None:
                continue  # neither an enabled counting line nor zone yet — still watching, not counting

            h, w = frame.shape[:2]
            detections = detector.detect(frame)

            if line is not None:
                virtual_line, in_direction, out_direction = line
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

            if zone is not None and shop_id:
                _watch_zone(
                    camera_id, shop_id, frame, w, h, detections, zone, current_ignore_regions(),
                    zone_classifier, zone_background,
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
    global _face_checker, _detector_name
    detector = PersonDetector()
    _detector_name = detector.name
    _face_checker = FaceChecker()
    if _face_checker.available:
        _detector_name += "+face"

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
