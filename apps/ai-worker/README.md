# @dbi/ai-worker (Python)

Real video-processing worker for footfall counting. Opens each camera's actual
video source, detects people, tracks them across frames, and counts a crossing
whenever a tracked person's trajectory crosses the shop's configured virtual
counting line — then submits the `IN`/`OUT` event to the Core API.

Previously this package was a TypeScript stub that only emitted synthetic
simulated events on a timer; it never touched a real frame. This rewrite
(Python + OpenCV) is based on the working stream-reading and person-detection
pipeline from the sibling `theaft-ai` project, with the theft/zone-specific
parts (shutter-interaction classifier, zone intrusion) replaced by this
project's own line-crossing counting logic. See `src/tracking/centroid_tracker.py`
for the one piece that had to be written fresh — theft detection only needed
per-frame zone presence, footfall counting needs an actual cross-frame
trajectory to know direction.

**Scope lock:** entries/exits only. No theft/security classification, no
identity tracking beyond the single-session centroid needed to compute
direction, no zone intrusion logic.

## Layout

```
src/
  main.py                      orchestrator: discover cameras, one watcher thread per camera
  client.py                    HTTP client for /internal/v1/footfall/* (x-ai-secret auth)
  config.py                    env-driven config
  stream/reader.py             opens RTSP/file/webcam source, reconnects on drop, loops local clips
  detection/person_detector.py OpenCV HOG+SVM person detector (no model download needed)
  tracking/centroid_tracker.py greedy nearest-centroid multi-object tracker (new, not in theaft-ai)
  geometry/line_crossing.py    virtual-line crossing + IN/OUT direction (ported from the old TS worker)
tests/
  test_line_crossing.py        unit tests for the crossing geometry
  test_tracker.py              unit tests for the centroid tracker
  smoke_single_camera.py       manual live smoke test against one real camera (talks to a running backend)
```

## Which cameras this worker processes

`GET /internal/v1/footfall/cameras` returns every camera except
`connectionType: MOCK_STREAM` — mock-stream cameras are intentionally pure
UI-side DEMO data with no real footage to open, so the worker skips them.
`TEST_CLIP` cameras work exactly like RTSP ones: their `streamUrl` is a local
video file path (or any path OpenCV's `VideoCapture` can open) instead of an
`rtsp://` URL, and the reader loops it back to frame 0 at end-of-file — this
is what the one-day plan's "representative recorded clip" acceptance path
uses when no live camera is available. `TEST_CLIP`/`MOCK_STREAM` never count
as `LIVE` in the dashboard's data-source badge — only a genuinely `ONLINE`
`RTSP`/`HTTP_STREAM`/`WEBCAM` camera does (see `analytics.service.ts`).

## Setup

```
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
```

## Run

```
cd src
..\.venv\Scripts\python.exe main.py
```

Needs the Core API reachable at `CORE_API_URL` and the same
`AI_SERVICE_SHARED_SECRET` the API's `.env` uses.

## Test

```
.venv\Scripts\python.exe -m pytest tests/test_line_crossing.py tests/test_tracker.py -v
```

`smoke_single_camera.py` is not a pytest test — it talks to a live backend and
a live camera, run it manually: `python tests/smoke_single_camera.py <cameraId>`.

## Known limitations

- The HOG+SVM detector is OpenCV's built-in person detector — noticeably less
  accurate than a modern model (YOLOv8n etc.). It will miss partial/side-on
  bodies and can false-positive on bins or mannequins. Swap in a heavier model
  by keeping `PersonDetector.detect(frame) -> list[Detection]`'s shape.
- The centroid tracker is intentionally simple (nearest-centroid greedy
  matching, no Kalman filter / re-ID) — adequate for a handful of people in
  frame at low sampling rates, not a crowd-scale tracker.
- `DETECTION_INTERVAL_SEC` trades CPU for responsiveness; too large a value
  can let a fast-moving person cross the line between samples and go uncounted.
