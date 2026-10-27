"""Standalone CLI: grab one JPEG thumbnail from a stream URL.

Usage: python tools/grab_frame.py <stream-url>

Spawned by the Connector (apps/connector/src/lib/probe.js) once per channel found during a
"Find channels" scan, to show a thumbnail for each. Prints exactly one JSON line to stdout
and nothing else — never the stream URL, which may carry camera credentials.
"""

import os

os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")  # before cv2 import, below

import json
import sys

OPEN_TIMEOUT_MSEC = 6000
READ_TIMEOUT_MSEC = 6000
SKIP_FRAMES = 3
THUMB_WIDTH = 320
JPEG_QUALITY = 60


def _emit(obj: dict) -> None:
    print(json.dumps(obj), flush=True)


def grab(stream_url: str) -> dict:
    import cv2

    cap = cv2.VideoCapture(stream_url)
    try:
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, OPEN_TIMEOUT_MSEC)
        cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, READ_TIMEOUT_MSEC)
    except Exception:
        pass  # not every OpenCV build supports these flags

    if not cap.isOpened():
        cap.release()
        return {"error": "could not open stream"}

    try:
        frame = None
        for _ in range(SKIP_FRAMES + 1):
            ok, frame = cap.read()
            if not ok or frame is None:
                return {"error": "could not read a frame"}

        h, w = frame.shape[:2]
        if w > THUMB_WIDTH:
            scale = THUMB_WIDTH / w
            frame = cv2.resize(frame, (THUMB_WIDTH, int(h * scale)), interpolation=cv2.INTER_AREA)

        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
        if not ok:
            return {"error": "could not encode frame"}

        import base64

        return {"jpeg": base64.b64encode(buf.tobytes()).decode("ascii")}
    finally:
        cap.release()


def main() -> None:
    if len(sys.argv) < 2:
        _emit({"error": "usage: grab_frame.py <stream-url>"})
        sys.exit(1)

    try:
        result = grab(sys.argv[1])
    except Exception as e:  # noqa: BLE001 - must always emit valid JSON, never a traceback
        result = {"error": str(e)}

    _emit(result)


if __name__ == "__main__":
    main()
