"""Manual smoke test: runs the real pipeline (stream open -> detect -> track ->
line-cross -> submit) against ONE specific camera for a few seconds, then stops.
Not a pytest test (talks to a live backend) — run directly: python smoke_single_camera.py <camera_id>
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import client  # noqa: E402
from detection.person_detector import PersonDetector  # noqa: E402
from geometry.line_crossing import NormalizedLine, Point2D, detect_line_crossing  # noqa: E402
from stream.reader import StreamReader  # noqa: E402
from tracking.centroid_tracker import CentroidTracker  # noqa: E402

RUN_SECONDS = 6


def main():
    camera_id = sys.argv[1]

    config = client.get_stream_config(camera_id)
    print("stream-config:", config)
    assert config is not None, "stream-config fetch failed"

    coords = config["countingLine"]["coordinates"]
    line = NormalizedLine(coords["x1"], coords["y1"], coords["x2"], coords["y2"])
    rule = config["countingLine"]["inDirection"]

    reader = StreamReader(config["streamUrl"])
    detector = PersonDetector()
    tracker = CentroidTracker()

    assert client.send_heartbeat(camera_id, status="ONLINE"), "heartbeat POST failed"
    print("heartbeat OK")

    start = time.time()
    frame_count = 0
    detection_count = 0
    crossings = 0

    for frame in reader.frames(lambda: time.time() - start > RUN_SECONDS):
        frame_count += 1
        h, w = frame.shape[:2]
        detections = detector.detect(frame)
        detection_count += len(detections)
        centroids = [d.centroid for d in detections]
        tracks = tracker.update(centroids)

        for track in tracks.values():
            if track.prev_centroid is None:
                continue
            prev_norm = Point2D(track.prev_centroid[0] / w, track.prev_centroid[1] / h)
            curr_norm = Point2D(track.centroid[0] / w, track.centroid[1] / h)
            direction = detect_line_crossing(line, prev_norm, curr_norm, rule)
            if direction:
                crossings += 1
                print(f"crossing: {direction}")

    reader.close()
    print(f"frames read: {frame_count}, raw HOG detections: {detection_count}, crossings: {crossings}")
    assert frame_count > 0, "stream never produced a single frame"
    print("SMOKE TEST PASS: stream opened, frames flowed, pipeline ran without crashing")


if __name__ == "__main__":
    main()
